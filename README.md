# BacktradeLab

BacktradeLab is a Laravel, Inertia, and React trading-practice platform. It provides multi-exchange market data, candle replay, simulated execution, chart drawings, trade journaling, reports, alerts, OAuth authentication, and one-time PayMongo-hosted subscriptions.

BacktradeLab is an educational simulation tool. It does not execute real trades, custody customer trading funds, or provide investment advice.

## Documentation

- [`docs/developer/README.md`](docs/developer/README.md) - complete developer handbook and feature index.
- [`docs/developer/01-getting-started.md`](docs/developer/01-getting-started.md) - install and run the project from a fresh checkout.
- [`docs/developer/02-project-architecture.md`](docs/developer/02-project-architecture.md) - Laravel, Inertia, React, database, and request-flow architecture.
- [`docs/developer/deployment-and-production.md`](docs/developer/deployment-and-production.md) - production configuration, deployment, PayMongo rollout, and operational checks.

## Technology

- Laravel 10 and PHP 8.1+
- Inertia.js and React 18
- Tailwind CSS and Vite
- Lightweight Charts
- MySQL
- Redis for production cache, sessions, queues, and rate limiting
- Laravel Socialite for Google and Apple authentication

## Local setup

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate
npm run build
```

Configure the database, mail service, OAuth providers, and application URL in `.env`. Never commit a populated `.env`, private key, certificate, service-account file, database dump, payment proof, or production backup.

For active frontend development:

```bash
npm run dev
php artisan serve
```

## Public and authenticated entry points

- `/` - public product page
- `/login` - password, Google, and Apple sign-in
- `/privacy-policy` - public privacy policy
- `/terms-of-service` - public terms
- `/market` - trader Market Summary
- `/dashboard` - trader Workspace or superadmin dashboard
- `/trade-report` - simulated PnL report, calendar, and journal
- `/subscription` - replay access and subscription history
- `/admin/subscriptions` - PayMongo transaction monitor and archived manual history

## Security notes

- Password login, password reset, OAuth entry points, APIs, and backtest actions use named rate limits.
- Google, Apple, mail, AWS, and optional Apple integration credentials are environment-backed.
- Runtime code reads environment-backed values through Laravel configuration so configuration caching remains safe.
- Demo-account values are simulations and never represent custody of real user funds.
- PayMongo secret and webhook keys must remain in deployment secrets and must never be exposed to frontend responses or committed to source control.
- Production checkout is intentionally gated by live credentials and `PAYMONGO_LIVE_ENABLED=true`; enable it only after business, tax, invoicing, refund, consumer-protection, and provider requirements are satisfied.

Review the [deployment and production guide](docs/developer/deployment-and-production.md) before exposing the application to real users.
