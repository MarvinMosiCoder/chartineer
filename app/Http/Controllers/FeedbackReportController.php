<?php

namespace App\Http\Controllers;

use App\Models\UserFeedback;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class FeedbackReportController extends Controller
{
    private const CATEGORIES = ['payment', 'subscription', 'account', 'enhancement', 'feature', 'bug', 'usability', 'performance', 'other'];
    private const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    private const STATUSES = ['submitted', 'reviewing', 'planned', 'in_progress', 'completed', 'declined'];
    private const OPEN_STATUSES = ['submitted', 'reviewing', 'planned', 'in_progress'];
    private const RESOLVED_STATUSES = ['completed', 'declined'];
    private const HIGH_SEVERITY_PRIORITIES = ['urgent', 'high'];

    public function adminPage(Request $request)
    {
        return Inertia::render('Reports/FeedbackAnalytics');
    }

    public function adminIndex(Request $request)
    {
        [$from, $to] = $this->resolveRange($request);

        return response()->json($this->buildReport($from, $to));
    }

    public function export(Request $request)
    {
        [$from, $to] = $this->resolveRange($request);
        $report = $this->buildReport($from, $to);
        $filename = "feedback-report-{$from->format('Ymd')}-{$to->format('Ymd')}.csv";

        return response()->streamDownload(function () use ($report) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Category', 'Count', 'Percent', 'Urgent/High Count']);
            foreach ($report['categoryBreakdown'] as $row) {
                fputcsv($handle, [$row['category'], $row['count'], $row['percent'], $row['urgentHighCount']]);
            }
            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function resolveRange(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $to = isset($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : Carbon::now()->endOfDay();
        $from = isset($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : $to->copy()->subDays(29)->startOfDay();

        return [$from, $to];
    }

    private function buildReport(Carbon $from, Carbon $to): array
    {
        $items = UserFeedback::query()
            ->whereBetween('created_at', [$from, $to])
            ->get(['category', 'priority', 'status', 'created_at', 'responded_at']);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totalCount' => $items->count(),
            'categoryBreakdown' => $this->categoryBreakdown($items),
            'priorityBreakdown' => $this->countBy($items, 'priority', self::PRIORITIES),
            'statusBreakdown' => $this->statusBreakdown($items),
            'responseTime' => $this->responseTime($items),
            'volumeTrend' => $this->volumeTrend($items),
        ];
    }

    private function categoryBreakdown($items): array
    {
        $total = $items->count();

        return collect(self::CATEGORIES)
            ->map(function (string $category) use ($items, $total) {
                $matching = $items->where('category', $category);
                $count = $matching->count();

                return [
                    'category' => $category,
                    'count' => $count,
                    'percent' => $total > 0 ? round($count / $total * 100, 1) : 0.0,
                    'urgentHighCount' => $matching->whereIn('priority', self::HIGH_SEVERITY_PRIORITIES)->count(),
                ];
            })
            ->filter(fn (array $row) => $row['count'] > 0)
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    private function countBy($items, string $field, array $values): array
    {
        return collect($values)
            ->map(fn (string $value) => ['value' => $value, 'count' => $items->where($field, $value)->count()])
            ->all();
    }

    private function statusBreakdown($items): array
    {
        return [
            'byStatus' => $this->countBy($items, 'status', self::STATUSES),
            'open' => $items->whereIn('status', self::OPEN_STATUSES)->count(),
            'resolved' => $items->whereIn('status', self::RESOLVED_STATUSES)->count(),
        ];
    }

    private function responseTime($items): array
    {
        $responded = $items->whereNotNull('responded_at');
        $hours = $responded
            ->map(fn (UserFeedback $item) => Carbon::parse($item->created_at)->diffInHours(Carbon::parse($item->responded_at)))
            ->values();

        return [
            'medianResponseHours' => $this->median($hours->all()),
            'respondedCount' => $responded->count(),
            'awaitingResponseCount' => $items->count() - $responded->count(),
            'awaitingResponsePercent' => $items->count() > 0
                ? round(($items->count() - $responded->count()) / $items->count() * 100, 1)
                : 0.0,
        ];
    }

    private function median(array $values): ?float
    {
        if (empty($values)) return null;

        sort($values);
        $count = count($values);
        $middle = intdiv($count, 2);

        return $count % 2 === 0
            ? round(($values[$middle - 1] + $values[$middle]) / 2, 1)
            : round($values[$middle], 1);
    }

    private function volumeTrend($items): array
    {
        $buckets = [];
        foreach ($items as $item) {
            $weekStart = Carbon::parse($item->created_at)->startOfWeek();
            $key = $weekStart->format('Y-m-d');
            $buckets[$key] ??= ['period' => $key, 'sort' => $weekStart, 'count' => 0];
            $buckets[$key]['count']++;
        }

        return collect($buckets)
            ->sortBy('sort')
            ->map(fn ($bucket) => ['period' => $bucket['period'], 'count' => $bucket['count']])
            ->values()
            ->all();
    }
}
