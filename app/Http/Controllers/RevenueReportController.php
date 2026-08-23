<?php

namespace App\Http\Controllers;

use App\Models\SubscriptionPlan;
use App\Models\SubscriptionRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class RevenueReportController extends Controller
{
    private const GRANULARITIES = ['day', 'week', 'month', 'year'];

    public function adminPage(Request $request)
    {
        return Inertia::render('Reports/RevenueReports');
    }

    public function adminIndex(Request $request)
    {
        [$granularity, $from, $to] = $this->resolveRange($request);

        return response()->json($this->buildReport($granularity, $from, $to));
    }

    public function export(Request $request)
    {
        [$granularity, $from, $to] = $this->resolveRange($request);
        $report = $this->buildReport($granularity, $from, $to);
        $filename = "revenue-report-{$granularity}-{$from->format('Ymd')}-{$to->format('Ymd')}.csv";

        return response()->streamDownload(function () use ($report) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Period', 'Gross Paid (PHP)', 'Refunds (PHP)', 'Net Revenue (PHP)', 'Transactions']);
            foreach ($report['series'] as $row) {
                fputcsv($handle, [$row['period'], $row['grossPaid'], $row['refunds'], $row['netRevenue'], $row['transactionCount']]);
            }
            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    /** @return array{0: string, 1: Carbon, 2: Carbon} */
    private function resolveRange(Request $request): array
    {
        $validated = $request->validate([
            'granularity' => ['required', 'in:'.implode(',', self::GRANULARITIES)],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $granularity = $validated['granularity'];
        $to = isset($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : Carbon::now()->endOfDay();
        $from = isset($validated['from'])
            ? Carbon::parse($validated['from'])->startOfDay()
            : $this->defaultFrom($granularity, $to);

        return [$granularity, $from, $to];
    }

    private function defaultFrom(string $granularity, Carbon $to): Carbon
    {
        return match ($granularity) {
            'day' => $to->copy()->subDays(29)->startOfDay(),
            'week' => $to->copy()->subWeeks(11)->startOfWeek(),
            'month' => $to->copy()->subMonths(11)->startOfMonth(),
            'year' => $to->copy()->subYears(4)->startOfYear(),
        };
    }

    private function buildReport(string $granularity, Carbon $from, Carbon $to): array
    {
        $paid = SubscriptionRequest::query()
            ->where('status', 'paid')
            ->where('currency', 'PHP')
            ->whereBetween('paid_at', [$from, $to])
            ->get(['plan', 'amount', 'paid_at']);

        $refunded = SubscriptionRequest::query()
            ->whereNotNull('refunded_at')
            ->whereBetween('refunded_at', [$from, $to])
            ->get(['plan', 'refund_amount', 'refunded_at']);

        return [
            'granularity' => $granularity,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'series' => $this->bucketSeries($granularity, $paid, $refunded),
            'planBreakdown' => $this->planBreakdown($paid, $refunded),
            'comparison' => $this->comparePreviousPeriod($from, $to),
        ];
    }

    /** @return array{0: string, 1: Carbon} */
    private function bucketKey(string $granularity, Carbon $date): array
    {
        $start = match ($granularity) {
            'day' => $date->copy()->startOfDay(),
            'week' => $date->copy()->startOfWeek(),
            'month' => $date->copy()->startOfMonth(),
            'year' => $date->copy()->startOfYear(),
        };

        $key = match ($granularity) {
            'day', 'week' => $start->format('Y-m-d'),
            'month' => $start->format('Y-m'),
            'year' => $start->format('Y'),
        };

        return [$key, $start];
    }

    private function bucketSeries(string $granularity, $paid, $refunded): array
    {
        $buckets = [];

        foreach ($paid as $row) {
            [$key, $start] = $this->bucketKey($granularity, Carbon::parse($row->paid_at));
            $buckets[$key] ??= ['period' => $key, 'sort' => $start, 'grossPaid' => 0.0, 'refunds' => 0.0, 'transactionCount' => 0];
            $buckets[$key]['grossPaid'] += (float) $row->amount;
            $buckets[$key]['transactionCount']++;
        }

        foreach ($refunded as $row) {
            [$key, $start] = $this->bucketKey($granularity, Carbon::parse($row->refunded_at));
            $buckets[$key] ??= ['period' => $key, 'sort' => $start, 'grossPaid' => 0.0, 'refunds' => 0.0, 'transactionCount' => 0];
            $buckets[$key]['refunds'] += (float) $row->refund_amount;
        }

        return collect($buckets)
            ->sortBy('sort')
            ->map(fn ($bucket) => [
                'period' => $bucket['period'],
                'grossPaid' => round($bucket['grossPaid'], 2),
                'refunds' => round($bucket['refunds'], 2),
                'netRevenue' => round($bucket['grossPaid'] - $bucket['refunds'], 2),
                'transactionCount' => $bucket['transactionCount'],
            ])
            ->values()
            ->all();
    }

    private function planBreakdown($paid, $refunded): array
    {
        $planNames = SubscriptionPlan::query()->pluck('name', 'code');
        $rows = [];

        foreach ($paid as $row) {
            $code = $row->plan ?? 'unknown';
            $rows[$code] ??= ['plan' => $code, 'grossPaid' => 0.0, 'refunds' => 0.0, 'transactionCount' => 0];
            $rows[$code]['grossPaid'] += (float) $row->amount;
            $rows[$code]['transactionCount']++;
        }

        foreach ($refunded as $row) {
            $code = $row->plan ?? 'unknown';
            $rows[$code] ??= ['plan' => $code, 'grossPaid' => 0.0, 'refunds' => 0.0, 'transactionCount' => 0];
            $rows[$code]['refunds'] += (float) $row->refund_amount;
        }

        return collect($rows)
            ->map(fn ($row) => [
                'plan' => $row['plan'],
                'planName' => $planNames[$row['plan']] ?? ucfirst($row['plan']),
                'grossPaid' => round($row['grossPaid'], 2),
                'refunds' => round($row['refunds'], 2),
                'netRevenue' => round($row['grossPaid'] - $row['refunds'], 2),
                'transactionCount' => $row['transactionCount'],
            ])
            ->sortByDesc('netRevenue')
            ->values()
            ->all();
    }

    private function comparePreviousPeriod(Carbon $from, Carbon $to): array
    {
        $lengthInSeconds = $from->diffInSeconds($to);
        $previousTo = $from->copy()->subSecond();
        $previousFrom = $previousTo->copy()->subSeconds($lengthInSeconds);

        $currentNet = $this->netRevenueForRange($from, $to);
        $previousNet = $this->netRevenueForRange($previousFrom, $previousTo);

        return [
            'currentNetRevenue' => round($currentNet, 2),
            'previousNetRevenue' => round($previousNet, 2),
            'percentChange' => $previousNet != 0.0
                ? round((($currentNet - $previousNet) / abs($previousNet)) * 100, 2)
                : null,
        ];
    }

    private function netRevenueForRange(Carbon $from, Carbon $to): float
    {
        $paid = (float) SubscriptionRequest::query()
            ->where('status', 'paid')
            ->where('currency', 'PHP')
            ->whereBetween('paid_at', [$from, $to])
            ->sum('amount');

        $refunds = (float) SubscriptionRequest::query()
            ->whereNotNull('refunded_at')
            ->whereBetween('refunded_at', [$from, $to])
            ->sum('refund_amount');

        return $paid - $refunds;
    }
}
