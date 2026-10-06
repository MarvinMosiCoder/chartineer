<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class AppleCallbackController extends Controller
{
    public function receive(Request $request): RedirectResponse
    {
        // No session middleware here: Apple's cross-site POST omits SameSite=Lax cookies.
        // A 303 GET restores the original session without setting a replacement cookie.
        $payload = $request->validate([
            'state' => ['required', 'string', 'size:40', 'alpha_num:ascii'],
            'code' => ['required_without:error', 'nullable', 'string', 'max:2048'],
            'error' => ['nullable', 'string', 'max:255'],
            'user' => ['nullable', 'json', 'max:4096'],
        ]);
        $handoff = Str::random(64);
        Cache::put('oauth:apple:callback:'.$handoff, Crypt::encryptString(json_encode($payload)), 60);

        return redirect()->route('social.callback', ['provider' => 'apple', 'handoff' => $handoff], 303)
            ->withHeaders(['Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer']);
    }

    public function restore(Request $request): void
    {
        $handoff = $request->query('handoff');
        abort_unless(is_string($handoff) && preg_match('/^[a-zA-Z0-9]{64}$/D', $handoff), 400);
        $payload = Cache::lock('oauth:apple:callback-lock:'.$handoff, 5)->block(2, fn () => Cache::pull('oauth:apple:callback:'.$handoff)
        );
        abort_unless(is_string($payload), 400);
        $payload = json_decode(Crypt::decryptString($payload), true, 512, JSON_THROW_ON_ERROR);
        $state = $request->session()->get('state');
        abort_unless(is_string($state) && hash_equals($state, $payload['state']), 400);

        // Discard URL parameters; only the stored Apple response reaches Socialite.
        $request->query->replace($payload);
        $request->request->replace([]);
    }
}
