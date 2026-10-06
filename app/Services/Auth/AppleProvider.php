<?php

namespace App\Services\Auth;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User;
use RuntimeException;

class AppleProvider extends AbstractProvider
{
    private const ISSUER = 'https://appleid.apple.com';

    protected $scopes = ['name', 'email'];

    protected $scopeSeparator = ' ';

    protected $encodingType = PHP_QUERY_RFC3986;

    private ?string $expectedNonce = null;

    public function redirect()
    {
        $settings = config('services.apple');
        $host = parse_url((string) $this->redirectUrl, PHP_URL_HOST);
        if (! $this->clientId || (! $this->clientSecret &&
            (empty($settings['team_id']) || empty($settings['key_id']) ||
                ! is_readable((string) ($settings['private_key'] ?? ''))))) {
            throw new RuntimeException('Apple sign-in credentials are not configured.');
        }
        if (parse_url((string) $this->redirectUrl, PHP_URL_SCHEME) !== 'https' || ! $host ||
            $host === 'localhost' || filter_var($host, FILTER_VALIDATE_IP) ||
            parse_url((string) $this->redirectUrl, PHP_URL_FRAGMENT) !== null) {
            throw new RuntimeException('Apple sign-in requires a registered HTTPS callback domain.');
        }

        $this->request->session()->put('apple_nonce', Str::random(64));
        $this->request->session()->put('apple_started_at', time());

        return parent::redirect();
    }

    protected function getAuthUrl($state)
    {
        return $this->buildAuthUrlFromBase(self::ISSUER.'/auth/authorize', $state);
    }

    protected function getTokenUrl()
    {
        return self::ISSUER.'/auth/token';
    }

    protected function getCodeFields($state = null)
    {
        return array_merge(parent::getCodeFields($state), [
            'response_mode' => 'form_post',
            'nonce' => $this->request->session()->get('apple_nonce'),
        ]);
    }

    public function user()
    {
        // Apple authentication always stays bound to the initiating browser session.
        if ($this->isStateless() || $this->hasInvalidState()) {
            throw new InvalidStateException;
        }
        $this->expectedNonce = $this->request->session()->pull('apple_nonce');
        $startedAt = $this->request->session()->pull('apple_started_at');
        if (! $this->expectedNonce || ! is_int($startedAt) || time() - $startedAt > 600 ||
            $this->request->input('error') || ! is_string($this->getCode()) || ! $this->getCode()) {
            throw new InvalidStateException;
        }

        $response = $this->getAccessTokenResponse($this->getCode());
        $claims = $this->getUserByToken($response['id_token'] ?? '');

        return $this->mapUserToObject($claims);
    }

    public function getAccessTokenResponse($code)
    {
        return Http::asForm()->connectTimeout(5)->timeout(15)
            ->post($this->getTokenUrl(), [
                'client_id' => $this->clientId,
                'client_secret' => $this->appleClientSecret(),
                'code' => $code,
                'grant_type' => 'authorization_code',
                'redirect_uri' => $this->redirectUrl,
            ])->throw()->json();
    }

    private function appleClientSecret(): string
    {
        if ($this->clientSecret) {
            return $this->clientSecret;
        }
        $settings = config('services.apple');
        $privateKey = file_get_contents($settings['private_key']);

        return JWT::encode([
            'iss' => $settings['team_id'],
            'iat' => time(),
            'exp' => time() + 300,
            'aud' => self::ISSUER,
            'sub' => $this->clientId,
        ], $privateKey, 'ES256', $settings['key_id']);
    }

    protected function getUserByToken($token)
    {
        if (! $this->expectedNonce || ! is_string($token) || ! $token) {
            throw new InvalidStateException;
        }
        $keySet = Cache::remember('oauth:apple:keys', 300, fn () => Http::connectTimeout(5)->timeout(10)->get(self::ISSUER.'/auth/keys')->throw()->json()
        );
        // Accept only Apple's RSA signing keys, never an algorithm chosen by the token.
        $keySet['keys'] = array_values(array_filter($keySet['keys'] ?? [], fn ($key) => ($key['kty'] ?? null) === 'RSA' && ($key['alg'] ?? null) === 'RS256'
        ));
        $claims = (array) JWT::decode($token, JWK::parseKeySet($keySet, 'RS256'));
        if (($claims['iss'] ?? null) !== self::ISSUER || ($claims['aud'] ?? null) !== $this->clientId ||
            ! isset($claims['exp'], $claims['iat']) || ! is_numeric($claims['exp']) || ! is_numeric($claims['iat']) ||
            $claims['exp'] <= time() || $claims['iat'] > time() ||
            ! is_string($claims['sub'] ?? null) || $claims['sub'] === '' || strlen($claims['sub']) > 255 ||
            ! is_string($claims['nonce'] ?? null) || ! hash_equals($this->expectedNonce, $claims['nonce'])) {
            throw new InvalidStateException;
        }
        if (! empty($claims['email']) &&
            (! in_array($claims['email_verified'] ?? false, [true, 'true'], true) ||
                ! is_string($claims['email']) || ! filter_var($claims['email'], FILTER_VALIDATE_EMAIL) ||
                strlen($claims['email']) > 255)) {
            throw new InvalidStateException;
        }

        return $claims;
    }

    protected function mapUserToObject(array $user)
    {
        // Apple sends the display name only on initial consent. It is not identity evidence.
        $profile = json_decode((string) $this->request->input('user', '{}'), true);
        $firstName = data_get($profile, 'name.firstName');
        $lastName = data_get($profile, 'name.lastName');
        $name = trim((is_string($firstName) ? $firstName : '').' '.(is_string($lastName) ? $lastName : ''));

        return (new User)->setRaw($user)->map([
            'id' => $user['sub'],
            'email' => $user['email'] ?? null,
            'name' => $name !== '' ? Str::limit(strip_tags($name), 255, '') : null,
        ]);
    }
}
