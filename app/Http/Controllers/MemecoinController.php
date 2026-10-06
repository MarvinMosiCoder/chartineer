<?php

namespace App\Http\Controllers;

use App\Jobs\ScanMemecoinWallets;
use App\Models\MemecoinAlert;
use App\Models\MemecoinReport;
use App\Models\MemecoinTrade;
use App\Models\MemecoinWallet;
use App\Services\Memecoin\Analyzer;
use App\Services\Memecoin\Chains;
use App\Services\Memecoin\WalletWatcher;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Throwable;

class MemecoinController extends Controller
{
    public function page(Request $request)
    {
        $view = $request->route('view', 'search');
        $chain = $request->route('chain');
        $address = $request->route('address');
        $id = $request->route('id');
        if ($chain && $address) Chains::validate($chain, $address);
        if ($id) $this->ownedReport($request, $id);
        return Inertia::render('Memecoin/Index', compact('view', 'chain', 'address', 'id'));
    }

    public function search(Request $request, Analyzer $analyzer)
    {
        $v = $request->validate(['q' => ['required', 'string', 'min:2', 'max:100'], 'chain' => ['nullable', Rule::in(array_keys(config('memecoin.chains')))]]);
        try {
            return response()->json($analyzer->search(trim($v['q']), $v['chain'] ?? null));
        } catch (Throwable $error) {
            return response()->json(['message' => 'Token search is unavailable. Try again shortly.'], 502);
        }
    }

    public function analyze(Request $request, Analyzer $analyzer, string $chain, string $address)
    {
        $address = Chains::validate($chain, $address);
        $blacklist = MemecoinWallet::where('adm_user_id', $request->user()->id)->where('list', 'blacklist')->pluck('address')->all();
        $report = $analyzer->analyze($chain, $address, $blacklist);
        $fingerprint = hash('sha256', json_encode([$chain, $address, $report['checked_at'], $report['assessment']]));
        MemecoinReport::firstOrCreate(['adm_user_id' => $request->user()->id, 'fingerprint' => $fingerprint], [
            'chain' => $chain, 'address' => $address, 'address_hash' => hash('sha256', $address),
            'symbol' => mb_substr($report['market']['symbol'] ?? $report['safety']['symbol'] ?? '', 0, 255) ?: null,
            'name' => mb_substr($report['market']['name'] ?? $report['safety']['name'] ?? '', 0, 255) ?: null,
            'verdict' => $report['assessment']['verdict'], 'score' => $report['assessment']['score'],
            'checked_at' => CarbonImmutable::parse($report['checked_at'])->utc(), 'report' => $report,
        ]);
        return response()->json($report);
    }

    public function market(Request $request, Analyzer $analyzer, string $chain, string $address)
    {
        $address = Chains::validate($chain, $address);
        try {
            return response()->json(['market' => $analyzer->market($chain, $address), 'fetched_at' => CarbonImmutable::now('UTC')->toISOString()]);
        } catch (Throwable $error) {
            return response()->json(['message' => 'Market refresh failed. Previous values may be out of date.'], 502);
        }
    }

    private function ownedReport(Request $request, string $id): MemecoinReport
    {
        return MemecoinReport::where('adm_user_id', $request->user()->id)->findOrFail($id);
    }

    public function reports(Request $request)
    {
        $v = $request->validate(['address' => ['nullable', 'string'], 'limit' => ['nullable', 'integer', 'min:1', 'max:200'], 'offset' => ['nullable', 'integer', 'min:0', 'max:100000']]);
        $address = empty($v['address']) ? null : Chains::any($v['address']);
        $query = MemecoinReport::where('adm_user_id', $request->user()->id)->orderByDesc('checked_at')->orderByDesc('id');
        if ($address) $query->where('address_hash', hash('sha256', $address));
        return response()->json($query->offset($v['offset'] ?? 0)->limit($v['limit'] ?? 50)->get(['id', 'address', 'chain', 'symbol', 'name', 'verdict', 'score', 'checked_at']));
    }

    public function report(Request $request, string $id)
    {
        return response()->json($this->ownedReport($request, $id)->only(['id', 'address', 'chain', 'symbol', 'name', 'verdict', 'score', 'checked_at', 'report']));
    }

    public function deleteReport(Request $request, string $id)
    {
        $this->ownedReport($request, $id)->delete();
        return response()->noContent();
    }

    public function clearReports(Request $request)
    {
        $request->validate(['confirm' => ['required', Rule::in(['clear_all_reports'])]]);
        return response()->json(['deleted' => MemecoinReport::where('adm_user_id', $request->user()->id)->delete()]);
    }

    public function wallets(Request $request)
    {
        $v = $request->validate(['list' => ['nullable', Rule::in(['blacklist', 'good_dev', 'watch'])]]);
        return response()->json(MemecoinWallet::where('adm_user_id', $request->user()->id)->when($v['list'] ?? null, fn ($q, $list) => $q->where('list', $list))->orderByDesc('id')->get());
    }

    public function addWallet(Request $request)
    {
        $v = $request->validate(['address' => ['required', 'string', 'max:64'], 'list' => ['required', Rule::in(['blacklist', 'good_dev', 'watch'])], 'label' => ['nullable', 'string', 'max:100'], 'note' => ['nullable', 'string', 'max:1000']]);
        $v['address'] = Chains::any($v['address']);
        $wallet = MemecoinWallet::firstOrCreate(['adm_user_id' => $request->user()->id, 'address_hash' => hash('sha256', $v['address']), 'list' => $v['list']], $v);
        if (!$wallet->wasRecentlyCreated) return response()->json(['message' => 'This wallet is already on that list.'], 409);
        return response()->json($wallet, 201);
    }

    public function deleteWallet(Request $request, string $id)
    {
        MemecoinWallet::where('adm_user_id', $request->user()->id)->findOrFail($id)->delete();
        return response()->noContent();
    }

    public function walletTokens(Request $request, string $chain, string $address)
    {
        $address = Chains::validate($chain, $address);
        $v = $request->validate(['relationship' => ['nullable', Rule::in(['creator', 'owner'])], 'limit' => ['nullable', 'integer', 'min:1', 'max:100'], 'offset' => ['nullable', 'integer', 'min:0', 'max:100000']]);
        $relationship = $v['relationship'] ?? 'creator';
        if ($chain === 'solana' && $relationship === 'owner') throw ValidationException::withMessages(['relationship' => 'Current-owner lookup is available for EVM chains only.']);
        $tokens = [];
        foreach (MemecoinReport::where('adm_user_id', $request->user()->id)->where('chain', $chain)->orderByDesc('checked_at')->orderByDesc('id')->cursor() as $row) {
            $recorded = data_get($row->report, 'safety.'.$relationship);
            if (!$recorded || Chains::normalize($recorded) !== $address) continue;
            $market = $row->report['market'] ?? [];
            $tokens[$row->address] ??= ['address' => $row->address, 'name' => $row->name, 'symbol' => $row->symbol, 'market_cap' => $market['market_cap'] ?? null, 'created_at' => null, 'observed_at' => $row->checked_at->toISOString(), 'source' => 'Saved report', 'report_id' => $row->id];
            if ($chain === 'solana') {
                foreach (data_get($row->report, 'safety.creator_tokens', []) ?? [] as $token) {
                    if (!empty($token['mint'])) $tokens[$token['mint']] ??= ['address' => $token['mint'], 'name' => null, 'symbol' => null, 'market_cap' => $token['market_cap'] ?? null, 'created_at' => $token['created_at'] ?? null, 'observed_at' => $row->checked_at->toISOString(), 'source' => 'RugCheck creator history', 'report_id' => null];
                }
            }
        }
        $limit = $v['limit'] ?? 50;
        $offset = $v['offset'] ?? 0;
        return response()->json(['chain' => $chain, 'address' => $address, 'relationship' => $relationship, 'tokens' => array_slice(array_values($tokens), $offset, $limit), 'total' => count($tokens), 'limit' => $limit, 'offset' => $offset, 'coverage' => 'saved_reports']);
    }

    public function trades(Request $request)
    {
        return response()->json(MemecoinTrade::where('adm_user_id', $request->user()->id)->orderByDesc('entered_at')->get());
    }

    private function tradeRules(bool $creating): array
    {
        return ['entry_price' => [$creating ? 'required' : 'sometimes', 'numeric', 'gt:0', 'max:1e20'], 'amount_usd' => ['nullable', 'numeric', 'gt:0', 'max:1e20'], 'entry_reason' => [$creating ? 'required' : 'sometimes', 'string', 'min:1', 'max:2000']];
    }

    public function addTrade(Request $request)
    {
        $v = $request->validate(array_merge($this->tradeRules(true), ['chain' => ['required', Rule::in(array_keys(config('memecoin.chains')))], 'address' => ['required', 'string', 'max:64'], 'symbol' => ['nullable', 'string', 'max:64'], 'entered_at' => ['nullable', 'date'], 'report_id' => ['nullable', 'integer']]));
        $v['address'] = Chains::validate($v['chain'], $v['address']);
        if (!empty($v['report_id'])) {
            $report = $this->ownedReport($request, (string) $v['report_id']);
            if ($report->chain !== $v['chain'] || Chains::normalize($report->address) !== $v['address']) throw ValidationException::withMessages(['report_id' => 'The saved report must belong to this token.']);
        }
        $v['entered_at'] = empty($v['entered_at']) ? CarbonImmutable::now('UTC') : CarbonImmutable::parse($v['entered_at'])->utc();
        return response()->json(MemecoinTrade::create(array_merge($v, ['adm_user_id' => $request->user()->id])), 201);
    }

    public function updateTrade(Request $request, string $id)
    {
        $v = $request->validate(array_merge($this->tradeRules(false), ['exit_price' => ['nullable', 'numeric', 'gt:0', 'max:1e20'], 'exit_reason' => ['nullable', 'string', 'min:1', 'max:2000'], 'exited_at' => ['nullable', 'date']]));
        $trade = DB::transaction(function () use ($request, $id, $v) {
            $trade = MemecoinTrade::where('adm_user_id', $request->user()->id)->lockForUpdate()->findOrFail($id);
            $trade->fill($v);
            if (($trade->exit_price === null) !== ($trade->exit_reason === null)) throw ValidationException::withMessages(['exit_price' => 'Closing a trade requires both an exit price and an exit reason.']);
            $trade->exited_at = $trade->exit_price === null ? null : ($trade->exited_at ?? CarbonImmutable::now('UTC'));
            if ($trade->exited_at && $trade->exited_at->lt($trade->entered_at)) throw ValidationException::withMessages(['exited_at' => 'An exit cannot precede the entry.']);
            $trade->save();
            return $trade;
        });
        return response()->json($trade);
    }

    public function deleteTrade(Request $request, string $id)
    {
        MemecoinTrade::where('adm_user_id', $request->user()->id)->findOrFail($id)->delete();
        return response()->noContent();
    }

    public function watchStatus(Request $request, WalletWatcher $watcher)
    {
        $userId = $request->user()->id;
        $wallets = MemecoinWallet::where('adm_user_id', $userId)->whereIn('list', ['watch', 'good_dev']);
        $last = (clone $wallets)->max('last_checked_at');
        return response()->json(['wallets' => (clone $wallets)->count(), 'last_checked_at' => $last ? CarbonImmutable::parse($last, 'UTC')->toISOString() : null, 'telegram' => $watcher->telegramEnabled($userId), 'checking' => Cache::has('memecoin:queued:'.$userId), 'last_result' => Cache::get('memecoin:watch-result:'.$userId)]);
    }

    public function checkWatch(Request $request)
    {
        $userId = $request->user()->id;
        if (!Cache::add('memecoin:queued:'.$userId, true, 600)) return response()->json(['message' => 'A wallet scan is already queued or running.'], 409);
        try {
            ScanMemecoinWallets::dispatch($userId)->onConnection(config('queue.default') === 'sync' ? 'database' : config('queue.default'));
        } catch (Throwable $error) {
            Cache::forget('memecoin:queued:'.$userId);
            throw $error;
        }
        return response()->json(['queued' => true, 'wallets_checked' => 0, 'new_alerts' => 0, 'errors' => (object) []], 202);
    }

    public function alerts(Request $request)
    {
        $v = $request->validate(['limit' => ['nullable', 'integer', 'min:1', 'max:200']]);
        $query = MemecoinAlert::where('adm_user_id', $request->user()->id);
        return response()->json(['alerts' => (clone $query)->orderByDesc('id')->limit($v['limit'] ?? 50)->get(), 'unseen' => (clone $query)->where('seen', false)->count()]);
    }

    public function markSeen(Request $request)
    {
        MemecoinAlert::where('adm_user_id', $request->user()->id)->where('seen', false)->update(['seen' => true]);
        return response()->noContent();
    }
}
