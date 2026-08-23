# Getting Started

## Requirements

- PHP 8.1 or newer with extensions required by Laravel and MySQL
- Composer
- Node.js and npm
- MySQL
- A local web server such as Laragon, or `php artisan serve`

## Install step by step

```bash
composer install
npm install
copy .env.example .env
php artisan key:generate
```

Create the database named by `DB_DATABASE`, then configure `.env`:

```env
APP_URL=http://localhost
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=backtradelab
DB_USERNAME=root
DB_PASSWORD=
```

Build the schema and frontend:

```bash
php artisan migrate
npm run build
```

For active development, run Vite and Laravel in separate terminals:

```bash
npm run dev
php artisan serve
```

Laragon users may use the generated local virtual host instead of `artisan serve`. `APP_URL` must match the URL used by OAuth callbacks and PayMongo return URLs.

## Local HTTPS tunnel testing

An HTTPS tunnel such as ngrok is useful for testing OAuth callbacks and PayMongo webhooks against a local server. Start Laravel on port 8000, then forward the same port:

```bash
php artisan serve --host=127.0.0.1 --port=8000
ngrok http 8000
```

Use the assigned HTTPS origin consistently in the local environment:

```env
APP_URL=https://example.ngrok-free.app
ASSET_URL=https://example.ngrok-free.app
GOOGLE_REDIRECT_URI="${APP_URL}/auth/google/callback"
SESSION_SECURE_COOKIE=true
```

Register `${APP_URL}/auth/google/callback` as an authorized Google redirect URI and `${APP_URL}/webhooks/paymongo` as the PayMongo webhook endpoint. Free tunnel hostnames may change after restart, so update both provider consoles and the local environment when they do.

Laravel must trust the tunnel's forwarded HTTPS headers or successful logins can redirect to an insecure `http://` URL. For local tunnel testing, set `protected $proxies = '*';` in `app/Http/Middleware/TrustProxies.php`. This wildcard is a local-development convenience; production should trust only its known proxy/load-balancer path and prevent untrusted clients from spoofing forwarded headers.

Use compiled frontend assets with a single Laravel tunnel:

```bash
npm run build
php artisan optimize:clear
```

Stop the Vite development server and remove a stale `public/hot` marker if Laravel still emits `localhost:5173` asset URLs. Otherwise, expose and configure Vite separately for HTTPS/HMR.

## Optional integrations

Configure only the integration being tested:

- Google/Facebook: `GOOGLE_*` and `FACEBOOK_*`
- Coin fundamentals: `COINMARKETCAP_API_KEY`; optional fallback `COINGECKO_API_KEY` and `COINGECKO_MODE`
- Market-data hardening: local file cache works for one instance; production requires Redis and the `MARKET_DATA_*` limits documented in `.env.example`
- PayMongo: `PAYMONGO_*`; keep disabled until configured
- Mail: `MAIL_*`
- Private/shared files: `FILESYSTEM_DISK` and `AWS_*`
- Legal identity: `LEGAL_*`

Never commit a populated `.env`, provider secret, private certificate, database dump, payment proof, or backup.

## Useful commands

```bash
php artisan route:list
php artisan migrate:status
php artisan test
npm run build
php artisan optimize:clear
```

## Common failures

| Symptom | Check |
|---|---|
| `No application encryption key` | Run `php artisan key:generate`. |
| Database connection error | Confirm MySQL is running and `DB_*` matches the local database. |
| Vite manifest missing | Run `npm install` and `npm run build`, or keep `npm run dev` running. |
| OAuth redirect mismatch | Make `APP_URL`, provider redirect URI, and provider console settings identical. |
| PayMongo unavailable | This is expected while `PAYMONGO_ENABLED=false` or credentials are absent. |
| Stale routes/config | Run `php artisan optimize:clear`. |
| One slow/runaway request makes everything else feel stuck | `php artisan serve` on Windows is single-threaded (no `pcntl`, so it cannot fork workers) — confirmed by checking Task Manager/`tasklist` for a single `php.exe` handling the configured port. Any one long-running request (a slow upstream call, a retry loop, an accidental multi-thousand-item batch) blocks every other request on that same process for its full duration, including unrelated ones like a candle fetch — the symptom looks like the *unrelated* request is hanging, when it's actually just queued. Use Laragon's own Apache/Nginx + PHP-FPM virtual host for anything beyond quick single-request checks, since PHP-FPM handles requests concurrently across multiple workers the way production does. |

Next: [Project architecture](02-project-architecture.md).
