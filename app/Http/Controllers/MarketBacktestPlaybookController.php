<?php

namespace App\Http\Controllers;

use App\Models\MarketBacktestPlaybook;
use App\Services\SubscriptionTierService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MarketBacktestPlaybookController extends Controller
{
    public function __construct(private readonly SubscriptionTierService $tiers)
    {
    }

    public function index(Request $request)
    {
        $validated = $request->validate([
            'include_archived' => ['nullable', 'boolean'],
        ]);

        $playbooks = MarketBacktestPlaybook::query()
            ->where('adm_user_id', $request->user()->id)
            ->when(!($validated['include_archived'] ?? false), fn ($query) => $query->where('is_active', true))
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get()
            ->map(fn (MarketBacktestPlaybook $playbook) => $this->serialize($playbook));

        return response()->json(['success' => true, 'playbooks' => $playbooks]);
    }

    public function store(Request $request)
    {
        // Counts only active playbooks: an archived one is not occupying a slot
        // the user can actually use.
        $this->tiers->assertWithinQuota($request->user(), 'playbooks', MarketBacktestPlaybook::query()
            ->where('adm_user_id', $request->user()->id)
            ->where('is_active', true)
            ->count());

        $validated = $this->validatePlaybook($request);
        $playbook = MarketBacktestPlaybook::create([
            ...$validated,
            'adm_user_id' => $request->user()->id,
            'checklist' => $this->normalizeChecklist($validated['checklist'] ?? []),
        ]);

        return response()->json(['success' => true, 'playbook' => $this->serialize($playbook)], 201);
    }

    public function update(Request $request, MarketBacktestPlaybook $playbook)
    {
        $playbook = $this->owned($request, $playbook);
        $validated = $this->validatePlaybook($request, $playbook);
        $validated['checklist'] = $this->normalizeChecklist($validated['checklist'] ?? []);
        $playbook->update($validated);

        return response()->json(['success' => true, 'playbook' => $this->serialize($playbook->fresh())]);
    }

    public function destroy(Request $request, MarketBacktestPlaybook $playbook)
    {
        $playbook = $this->owned($request, $playbook);
        $playbook->update(['is_active' => false]);

        return response()->json(['success' => true]);
    }

    private function owned(Request $request, MarketBacktestPlaybook $playbook): MarketBacktestPlaybook
    {
        abort_unless($playbook->adm_user_id === $request->user()->id, 404);

        return $playbook;
    }

    private function validatePlaybook(Request $request, ?MarketBacktestPlaybook $playbook = null): array
    {
        return $request->validate([
            'name' => [
                'required', 'string', 'max:120',
                Rule::unique('market_backtest_playbooks', 'name')
                    ->where('adm_user_id', $request->user()->id)
                    ->ignore($playbook?->id),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'entry_rules' => ['nullable', 'string', 'max:5000'],
            'confirmation_rules' => ['nullable', 'string', 'max:5000'],
            'invalidation_rules' => ['nullable', 'string', 'max:5000'],
            'stop_rules' => ['nullable', 'string', 'max:5000'],
            'target_rules' => ['nullable', 'string', 'max:5000'],
            'checklist' => ['nullable', 'array', 'max:20'],
            'checklist.*' => ['required', 'string', 'max:200'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function normalizeChecklist(array $items): array
    {
        return collect($items)
            ->map(fn ($item) => trim((string) $item))
            ->filter()
            ->unique(fn ($item) => strtolower($item))
            ->take(20)
            ->values()
            ->all();
    }

    private function serialize(MarketBacktestPlaybook $playbook): array
    {
        return [
            'id' => $playbook->id,
            'name' => $playbook->name,
            'description' => $playbook->description,
            'entryRules' => $playbook->entry_rules,
            'confirmationRules' => $playbook->confirmation_rules,
            'invalidationRules' => $playbook->invalidation_rules,
            'stopRules' => $playbook->stop_rules,
            'targetRules' => $playbook->target_rules,
            'checklist' => array_values($playbook->checklist ?? []),
            'isActive' => $playbook->is_active,
        ];
    }
}
