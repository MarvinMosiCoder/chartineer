<?php

namespace App\Jobs;

use App\Models\AdmModels\AdmNotifications;
use App\Models\MarketBacktestAccount;
use App\Models\MarketBacktestExport;
use App\Models\MarketBacktestPosition;
use App\Services\MarketBacktestReportService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Throwable;

class GenerateBacktestReportExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private int $exportId)
    {
    }

    public function handle(MarketBacktestReportService $reportService): void
    {
        $export = MarketBacktestExport::find($this->exportId);

        if (!$export) {
            return;
        }

        $export->update(['status' => 'processing']);

        try {
            $account = MarketBacktestAccount::findOrFail($export->market_backtest_account_id);
            $positions = $reportService->getReportPositions(
                $account,
                $export->symbol,
                $export->session_id,
                $export->row_limit
            );
            $rows = $positions->map(fn (MarketBacktestPosition $position) => $reportService->serializeReportPosition($position))->values();

            $filename = 'backtest-trades-' . now()->format('Ymd-His') . '-' . $export->id . '.' . $export->format;
            $path = "market-backtest-exports/{$export->adm_user_id}/{$filename}";
            $content = $export->format === 'json' ? $this->buildJson($rows) : $this->buildCsv($rows);

            Storage::disk('public')->put($path, $content);

            $export->update([
                'status' => 'ready',
                'file_path' => $path,
                'filename' => $filename,
            ]);

            AdmNotifications::query()->firstOrCreate(
                ['source_type' => 'market_backtest_export', 'source_id' => $export->id],
                [
                    'adm_user_id' => $export->adm_user_id,
                    'type' => 'export',
                    'content' => "Your trade report export ({$export->format}) is ready to download.",
                    'url' => route('market-backtest.report.export.download', $export->id),
                    'is_read' => false,
                ]
            );
        } catch (Throwable $e) {
            $export->update(['status' => 'failed', 'error' => $e->getMessage()]);

            AdmNotifications::query()->firstOrCreate(
                ['source_type' => 'market_backtest_export', 'source_id' => $export->id],
                [
                    'adm_user_id' => $export->adm_user_id,
                    'type' => 'export',
                    'content' => 'Your trade report export failed. Please try again.',
                    'url' => '/notifications/view-all-notifications',
                    'is_read' => false,
                ]
            );

            throw $e;
        }
    }

    private function buildJson($rows): string
    {
        return json_encode($rows, JSON_PRETTY_PRINT);
    }

    private function buildCsv($rows): string
    {
        $handle = fopen('php://temp', 'w+');
        fputcsv($handle, [
            'id',
            'session_id',
            'symbol',
            'side',
            'entry_price',
            'exit_price',
            'leverage',
            'margin_mode',
            'margin',
            'notional',
            'fee',
            'pnl',
            'pnl_percent',
            'result',
            'setup_tag',
            'tags',
            'emotion',
            'entry_reason',
            'exit_reason',
            'mistake',
            'journal_notes',
            'entry_snapshot',
            'exit_snapshot',
            'opened_at_time',
            'closed_at_time',
        ]);

        foreach ($rows as $row) {
            fputcsv($handle, [
                $row['id'],
                $row['sessionId'],
                $row['symbol'],
                $row['side'],
                $row['entryPrice'],
                $row['exitPrice'],
                $row['leverage'],
                $row['marginMode'],
                $row['margin'],
                $row['notional'],
                $row['fee'],
                $row['pnl'],
                $row['pnlPercent'],
                $row['result'],
                $row['setupTag'],
                implode('|', $row['tags'] ?? []),
                $row['emotion'],
                $row['entryReason'],
                $row['exitReason'],
                $row['mistake'],
                $row['journalNotes'],
                $row['entrySnapshotUrl'],
                $row['exitSnapshotUrl'],
                $row['openedAtTime'],
                $row['closedAtTime'],
            ]);
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return $csv;
    }
}
