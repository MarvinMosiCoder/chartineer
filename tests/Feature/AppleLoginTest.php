<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\AdmUser;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Laravel\Socialite\Facades\Socialite;
use Tests\TestCase;

class AppleLoginTest extends TestCase
{
    private static $signingKey;

    private array $authorization = [];

    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('pdo_sqlite is required for isolated authentication tests.');
        }
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');
        $this->withoutMiddleware(HandleInertiaRequests::class);
        config()->set('services.apple', [
            'client_id' => 'com.chartineer.web', 'client_secret' => 'test-secret',
            'redirect' => 'https://chartineer.example/auth/apple/callback',
        ]);
        config()->set('services.google', [
            'client_id' => 'google-test', 'client_secret' => 'google-secret',
            'redirect' => 'https://chartineer.example/auth/google/callback',
        ]);
        Cache::flush();
        Http::preventStrayRequests();
        self::$signingKey ??= openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $this->assertNotFalse(self::$signingKey, 'OpenSSL must be able to generate test signing keys.');
        $this->createSchema();
    }

    private function createSchema(): void
    {
        Schema::create('adm_users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->nullable()->unique();
            $table->string('email')->unique();
            $table->string('password');
            $table->string('status')->default('ACTIVE');
            $table->integer('id_adm_privileges');
            $table->string('social_provider')->nullable();
            $table->string('social_provider_id')->nullable();
            $table->boolean('password_login_enabled')->default(false);
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('terms_accepted_at')->nullable();
            $table->timestamp('privacy_accepted_at')->nullable();
            $table->string('legal_effective_date')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('adm_privileges', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('is_admin')->default(false);
            $table->boolean('is_superadmin')->default(false);
            $table->string('theme_color')->nullable();
        });
        Schema::create('adm_user_profiles', function (Blueprint $table) {
            $table->id();
            $table->integer('adm_user_id');
            $table->timestamp('archived')->nullable();
        });
        Schema::create('adm_modules', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('path');
        });
        Schema::create('adm_privileges_roles', function (Blueprint $table) {
            $table->id();
            $table->integer('id_adm_privileges');
            $table->integer('id_adm_modules');
            foreach (['visible', 'create', 'read', 'edit', 'delete', 'void', 'override'] as $permission) {
                $table->boolean('is_'.$permission)->default(false);
            }
        });
        Schema::create('adm_menus_privileges', function (Blueprint $table) {
            $table->id();
            $table->integer('id_adm_privileges');
            $table->integer('id_adm_menus');
        });
        foreach (['adm_menuses', 'adm_admin_menuses'] as $name) {
            Schema::create($name, function (Blueprint $table) {
                $table->id();
                $table->integer('parent_id')->default(0);
                $table->boolean('is_active')->default(true);
                $table->integer('sorting')->default(0);
            });
        }
        Schema::create('adm_logs', function (Blueprint $table) {
            $table->id();
            $table->integer('id_adm_users');
            $table->string('ipaddress');
            $table->text('useragent');
            $table->text('url');
            $table->text('description');
            $table->text('details');
            $table->timestamps();
        });
        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->string('status');
        });
        Schema::create('announcement_user', function (Blueprint $table) {
            $table->integer('adm_user_id');
            $table->integer('announcement_id');
        });
        Schema::create('adm_notifications', function (Blueprint $table) {
            $table->id();
            $table->integer('adm_user_id');
            $table->string('type');
            $table->text('content');
            $table->boolean('is_read');
            $table->text('url');
            $table->timestamps();
        });
        Schema::create('adm_settings', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('content');
        });
        DB::table('adm_privileges')->insert(['id' => 1, 'name' => 'Users']);
    }

    private function start(): void
    {
        Socialite::forgetDrivers();
        $response = $this->get('/auth/apple/redirect')->assertRedirect();
        $this->assertSame('appleid.apple.com', parse_url($response->headers->get('Location'), PHP_URL_HOST));
        parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $this->authorization);
    }

    private function token(array $overrides = [], array $remove = []): string
    {
        $claims = array_merge([
            'iss' => 'https://appleid.apple.com', 'aud' => 'com.chartineer.web',
            'iat' => time() - 5, 'exp' => time() + 300, 'sub' => 'apple-user-123',
            'nonce' => $this->authorization['nonce'], 'email' => 'hidden@privaterelay.appleid.com',
            'email_verified' => 'true',
        ], $overrides);
        foreach ($remove as $key) {
            unset($claims[$key]);
        }

        return JWT::encode($claims, self::$signingKey, 'RS256', 'apple-test-key');
    }

    private function fakeApple(string $token): void
    {
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::preventStrayRequests();
        $details = openssl_pkey_get_details(self::$signingKey);
        Http::fake([
            'appleid.apple.com/auth/token' => Http::response(['id_token' => $token]),
            'appleid.apple.com/auth/keys' => Http::response(['keys' => [[
                'kty' => 'RSA', 'kid' => 'apple-test-key', 'alg' => 'RS256',
                'n' => JWT::urlsafeB64Encode($details['rsa']['n']),
                'e' => JWT::urlsafeB64Encode($details['rsa']['e']),
            ]]]),
        ]);
    }

    private function receive(array $overrides = [])
    {
        $response = $this->post('/auth/apple/callback', array_merge([
            'state' => $this->authorization['state'], 'code' => 'one-time-code',
            'user' => json_encode(['name' => ['firstName' => 'Apple', 'lastName' => 'Trader'], 'email' => 'untrusted@example.test']),
        ], $overrides))->assertStatus(303);
        $this->assertSame([], $response->headers->getCookies(), 'Apple POST must never replace the initiating session cookie.');
        $this->assertStringNotContainsString('one-time-code', $response->headers->get('Location'));

        return $response;
    }

    private function finish(array $overrides = [])
    {
        $response = $this->receive($overrides);
        Socialite::forgetDrivers();

        return $this->get($response->headers->get('Location'));
    }

    private function user(array $overrides = []): AdmUser
    {
        return AdmUser::create(array_merge([
            'name' => 'Existing trader', 'email' => 'hidden@privaterelay.appleid.com',
            'password' => bcrypt('test-password'), 'id_adm_privileges' => 1,
            'status' => 'ACTIVE', 'social_provider' => 'apple', 'social_provider_id' => 'apple-user-123',
        ], $overrides));
    }

    public function test_apple_redirect_requests_scopes_state_and_nonce_and_google_still_works(): void
    {
        $this->start();
        $this->assertSame('name email', $this->authorization['scope']);
        $this->assertSame('form_post', $this->authorization['response_mode']);
        $this->assertSame('code', $this->authorization['response_type']);
        $this->assertSame(40, strlen($this->authorization['state']));
        $this->assertSame(64, strlen($this->authorization['nonce']));
        $response = $this->get('/auth/google/redirect')->assertRedirect();
        $this->assertStringContainsString('prompt=select_account', $response->headers->get('Location'));
        $this->get('/auth/facebook/redirect')->assertNotFound();
        $this->get('/auth/facebook/callback')->assertNotFound();
        $this->post('/auth/facebook/callback')->assertNotFound();
    }

    public function test_missing_configuration_returns_a_friendly_error(): void
    {
        config()->set('services.apple.client_id', null);
        $this->get('/auth/apple/redirect')->assertRedirect('/login')->assertSessionHasErrors('message');
        Http::assertNothingSent();
    }

    /** @dataProvider invalidRedirects */
    public function test_apple_requires_a_registered_https_domain(string $uri): void
    {
        config()->set('services.apple.redirect', $uri);
        $this->get('/auth/apple/redirect')->assertRedirect('/login')->assertSessionHasErrors('message');
    }

    public static function invalidRedirects(): array
    {
        return [['http://chartineer.test/auth/apple/callback'], ['https://localhost/auth/apple/callback'],
            ['https://127.0.0.1/auth/apple/callback'], ['https://chartineer.example/callback#fragment']];
    }

    public function test_first_apple_login_uses_verified_relay_email_and_requires_consent_before_creation(): void
    {
        $this->start();
        $this->fakeApple($this->token());
        $this->finish()->assertRedirect('/social-registration/confirm')
            ->assertSessionHas('pending_social_registration.provider', 'apple')
            ->assertSessionHas('pending_social_registration.email', 'hidden@privaterelay.appleid.com')
            ->assertSessionHas('pending_social_registration.name', 'Apple Trader');
        $this->assertGuest();
        $this->assertDatabaseCount('adm_users', 0);
        $this->get('/social-registration/confirm', ['X-Inertia' => 'true'])->assertOk()
            ->assertJsonPath('props.pending.provider', 'apple');
        $this->post('/social-registration/confirm', ['accepted' => false])->assertSessionHasErrors('accepted');
        $this->assertDatabaseCount('adm_users', 0);
        $this->post('/social-registration/confirm', ['accepted' => true])->assertRedirect('/market');
        $user = AdmUser::firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertSame('apple', $user->social_provider);
        $this->assertFalse($user->password_login_enabled);
        $this->assertNotNull($user->terms_accepted_at);
        $this->assertNotNull($user->privacy_accepted_at);
        $this->assertMatchesRegularExpression('/^User[0-9]{6}$/', $user->username);
    }

    public function test_known_apple_identity_takes_precedence_over_a_matching_email(): void
    {
        $emailMatch = $this->user(['social_provider' => 'google', 'social_provider_id' => 'google-123']);
        $identityMatch = $this->user(['email' => 'original@example.test']);
        $this->start();
        $this->fakeApple($this->token());
        $this->finish(['user' => null])->assertRedirect('/market');
        $this->assertAuthenticatedAs($identityMatch);
        $this->assertSame('google', $emailMatch->fresh()->social_provider);
    }

    public function test_existing_facebook_account_can_link_apple_by_verified_email_without_duplication(): void
    {
        $user = $this->user(['social_provider' => 'facebook', 'social_provider_id' => 'legacy-facebook-id', 'email' => 'TRADER@example.test']);
        $this->start();
        $this->fakeApple($this->token(['email' => 'trader@example.test', 'email_verified' => true]));
        $this->finish(['user' => null])->assertRedirect('/market');
        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseCount('adm_users', 1);
        $this->assertSame('apple-user-123', $user->fresh()->social_provider_id);
    }

    public function test_known_apple_identity_can_return_without_email_or_name(): void
    {
        $user = $this->user();
        $this->start();
        $this->fakeApple($this->token([], ['email', 'email_verified']));
        $this->finish(['user' => null])->assertRedirect('/market');
        $this->assertAuthenticatedAs($user);
    }

    public function test_unknown_identity_without_email_cannot_register(): void
    {
        $this->start();
        $this->fakeApple($this->token([], ['email', 'email_verified']));
        $this->finish(['user' => null])->assertRedirect('/login')->assertSessionHasErrors('message');
        $this->assertGuest();
        $this->assertDatabaseCount('adm_users', 0);
    }

    /** @dataProvider invalidClaims */
    public function test_invalid_identity_tokens_never_authenticate_or_create_users(array $claims, array $remove = []): void
    {
        $this->user();
        $this->start();
        $this->fakeApple($this->token($claims, $remove));
        $this->finish()->assertRedirect('/login')->assertSessionHasErrors('message');
        $this->assertGuest();
        $this->assertDatabaseCount('adm_users', 1);
        $this->assertFalse(session()->has('pending_social_registration'));
    }

    public static function invalidClaims(): array
    {
        return [
            'nonce mismatch' => [['nonce' => 'another-browser']],
            'wrong audience' => [['aud' => 'another-service']],
            'wrong issuer' => [['iss' => 'https://attacker.example']],
            'expired' => [['exp' => time() - 60]],
            'future issue time' => [['iat' => time() + 600]],
            'future issue time with past nbf' => [['iat' => time() + 600, 'nbf' => time() - 60]],
            'unverified email' => [['email_verified' => 'false']],
            'bad email' => [['email' => 'not-an-email']],
            'missing nonce' => [[], ['nonce']],
            'missing expiration' => [[], ['exp']],
            'missing subject' => [[], ['sub']],
        ];
    }

    public function test_tampered_signature_is_rejected(): void
    {
        $this->start();
        $parts = explode('.', $this->token());
        $parts[1] = JWT::urlsafeB64Encode(json_encode(['sub' => 'attacker']));
        $this->fakeApple(implode('.', $parts));
        $this->finish()->assertRedirect('/login')->assertSessionHasErrors('message');
        $this->assertGuest();
    }

    public function test_mismatched_browser_state_is_rejected_before_token_exchange(): void
    {
        $this->start();
        $this->finish(['state' => str_repeat('x', 40)])
            ->assertRedirect('/login')->assertSessionHasErrors('message');
        Http::assertNothingSent();
        $this->assertGuest();
    }

    public function test_callback_cannot_be_used_by_a_browser_without_the_original_session(): void
    {
        $this->start();
        $response = $this->receive();
        session()->forget(['state', 'apple_nonce', 'apple_started_at']);
        $this->get($response->headers->get('Location'))->assertRedirect('/login')->assertSessionHasErrors('message');
        Http::assertNothingSent();
        $this->assertGuest();
    }

    public function test_expired_authorization_session_is_rejected_before_token_exchange(): void
    {
        $this->start();
        session()->put('apple_started_at', time() - 601);
        $this->finish()->assertRedirect('/login')->assertSessionHasErrors('message');
        Http::assertNothingSent();
        $this->assertGuest();
    }

    public function test_token_exchange_failure_returns_to_login_without_creating_an_account(): void
    {
        $this->start();
        Http::fake(['appleid.apple.com/auth/token' => Http::response(['error' => 'invalid_grant'], 400)]);
        $this->finish()->assertRedirect('/login')->assertSessionHasErrors('message');
        $this->assertGuest();
        $this->assertDatabaseCount('adm_users', 0);
    }

    public function test_a_token_cannot_choose_a_different_signing_algorithm(): void
    {
        $this->start();
        $parts = explode('.', $this->token());
        $claims = json_decode(JWT::urlsafeB64Decode($parts[1]), true);
        $this->fakeApple(JWT::encode($claims, str_repeat('a', 64), 'HS256', 'apple-test-key'));
        $this->finish()->assertRedirect('/login')->assertSessionHasErrors('message');
        $this->assertGuest();
        $this->assertDatabaseCount('adm_users', 0);
    }

    public function test_new_apple_identity_without_first_consent_name_uses_an_email_fallback(): void
    {
        $this->start();
        $this->fakeApple($this->token());
        $this->finish(['user' => null])->assertRedirect('/social-registration/confirm')
            ->assertSessionHas('pending_social_registration.name', 'hidden');
    }

    public function test_cancelled_and_expired_apple_registration_never_create_users(): void
    {
        $this->start();
        $this->fakeApple($this->token());
        $this->finish()->assertRedirect('/social-registration/confirm');
        $this->delete('/social-registration/confirm')->assertRedirect('/login')
            ->assertSessionMissing('pending_social_registration');
        $this->start();
        $this->fakeApple($this->token());
        $this->finish()->assertRedirect('/social-registration/confirm');
        $this->travel(16)->minutes();
        $this->post('/social-registration/confirm', ['accepted' => true])->assertRedirect('/login')
            ->assertSessionMissing('pending_social_registration');
        $this->assertGuest();
        $this->assertDatabaseCount('adm_users', 0);
    }

    public function test_cancel_replay_expiry_and_direct_get_callbacks_are_rejected(): void
    {
        $this->start();
        $response = $this->receive(['error' => 'user_cancelled_authorize', 'code' => null]);
        Socialite::forgetDrivers();
        $this->get($response->headers->get('Location'))->assertRedirect('/login')->assertSessionHasErrors('message');
        $this->get($response->headers->get('Location'))->assertRedirect('/login')->assertSessionHasErrors('message');
        $this->start();
        $response = $this->receive();
        $this->travel(61)->seconds();
        $this->get($response->headers->get('Location'))->assertRedirect('/login')->assertSessionHasErrors('message');
        $this->travelBack();
        $this->get('/auth/apple/callback?state=forged&code=forged')->assertRedirect('/login')->assertSessionHasErrors('message');
        Http::assertNothingSent();
        $this->assertGuest();
    }

    public function test_inactive_and_admin_accounts_cannot_sign_in_with_apple(): void
    {
        $user = $this->user(['status' => 'INACTIVE']);
        $this->start();
        $this->fakeApple($this->token());
        $this->finish()->assertRedirect('/login')->assertSessionHasErrors(['message' => "Account Doesn't Exist/Deactivated"]);
        $this->assertGuest();
        $user->update(['status' => 'ACTIVE']);
        DB::table('adm_privileges')->where('id', 1)->update(['is_admin' => true]);
        $this->start();
        $this->fakeApple($this->token());
        $this->finish()->assertRedirect('/login')->assertSessionHasErrors(['message' => 'Please use the administrator login page.']);
        $this->assertGuest();
    }

    public function test_legacy_facebook_password_login_points_to_recovery(): void
    {
        $user = $this->user(['social_provider' => 'facebook']);
        $this->post('/login-save', ['email' => $user->email, 'password' => 'test-password'])
            ->assertRedirect('/login')->assertSessionHasErrors(['message' => 'Facebook sign-in has been replaced. Use Forgot Password to set a password, or sign in with Google or Apple using the same email address.']);
        $this->assertGuest();
    }

    public function test_private_key_generates_a_valid_es256_client_secret(): void
    {
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        $this->assertNotFalse($key);
        openssl_pkey_export($key, $privateKey);
        $path = storage_path('framework/testing-apple-'.bin2hex(random_bytes(8)).'.p8');
        file_put_contents($path, $privateKey);
        try {
            config()->set('services.apple.client_secret', null);
            config()->set('services.apple.team_id', 'APPLE_TEAM');
            config()->set('services.apple.key_id', 'APPLE_KEY');
            config()->set('services.apple.private_key', $path);
            $this->start();
            $this->fakeApple($this->token());
            $this->finish()->assertRedirect('/social-registration/confirm');
            Http::assertSent(function ($request) use ($key) {
                if ($request->url() !== 'https://appleid.apple.com/auth/token') {
                    return false;
                }
                $headers = new \stdClass;
                $claims = JWT::decode($request['client_secret'], new Key(openssl_pkey_get_details($key)['key'], 'ES256'), $headers);
                $this->assertSame('APPLE_KEY', $headers->kid);
                $this->assertSame('APPLE_TEAM', $claims->iss);
                $this->assertSame('com.chartineer.web', $claims->sub);
                $this->assertSame('https://appleid.apple.com', $claims->aud);
                $this->assertSame(300, $claims->exp - $claims->iat);
                $this->assertSame('one-time-code', $request['code']);
                $this->assertSame('authorization_code', $request['grant_type']);

                return true;
            });
        } finally {
            unlink($path);
        }
    }
}
