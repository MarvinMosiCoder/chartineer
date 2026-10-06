import React from 'react';
import LegalPage, { LegalList, LegalSection } from './LegalPage';

export default function PrivacyPolicy({ legal }) {
    const operator = legal?.operator_name || 'BacktradeLab';
    const contactEmail = legal?.contact_email || 'privacy@backtradelab.com';
    const effectiveDate = legal?.effective_date || 'July 15, 2026';

    return (
        <LegalPage
            title="Privacy Policy"
            description={`This policy explains how ${operator} collects, uses, stores, and shares information when you use BacktradeLab.`}
            effectiveDate={effectiveDate}
        >
            <LegalSection title="1. Who we are">
                <p>{operator} operates BacktradeLab, a market-replay, paper-trading, charting, and trade-journaling service. For privacy questions or requests, email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
            </LegalSection>

            <LegalSection title="2. Information we collect">
                <LegalList>
                    <li><strong>Account and profile information:</strong> name, email address, username, timezone, trading experience, profile image, account status, and password-related security records.</li>
                    <li><strong>Google or Apple sign-in information:</strong> provider name, provider account identifier, name, and email address returned by the provider. We do not receive your Google or Apple password.</li>
                    <li><strong>Trading-workspace content:</strong> saved markets, chart drawings, tool settings, replay checkpoints, alerts, simulated orders and positions, sessions, journal notes and tags, and chart snapshots.</li>
                    <li><strong>Subscription and support information:</strong> selected plan, price and duration snapshot, PayMongo Checkout Session and payment identifiers, payment method, currency, mode, status, timestamps, transaction metadata, feedback, and administrative responses. Historical manual-payment proofs, messages, attachments, and review records remain stored as read-only records.</li>
                    <li><strong>Technical and security information:</strong> IP address, session and cookie data, login and activity logs, browser requests, errors, and timestamps.</li>
                </LegalList>
            </LegalSection>

            <LegalSection title="3. How we use information">
                <LegalList>
                    <li>Authenticate you, create and secure your account, and provide account recovery.</li>
                    <li>Provide charting, replay, paper-trading, journaling, reporting, alerts, subscriptions, and support.</li>
                    <li>Remember your settings and synchronize your workspace across sessions where supported.</li>
                    <li>Create PayMongo hosted checkouts, verify signed payment events, reconcile transaction status, prevent duplicate activation, grant purchased access, and maintain transaction records.</li>
                    <li>Monitor reliability, investigate misuse, enforce our Terms, and comply with legal obligations.</li>
                </LegalList>
                <p>Google user data is used only to sign you in, create or link your BacktradeLab account, secure that account, and provide user-facing account features. We do not use Google user data for advertising, credit decisions, sale to data brokers, or training generalized artificial-intelligence models.</p>
            </LegalSection>

            <LegalSection title="4. Legal bases and consent">
                <p>We process information as necessary to provide the service you request, to pursue legitimate interests such as security and service improvement, to comply with law, and where applicable with your consent. You may withdraw consent for consent-based processing, but this does not affect processing already performed or information required to maintain legal records.</p>
            </LegalSection>

            <LegalSection title="5. When we share information">
                <p>We do not sell personal information. We may disclose the minimum information needed to:</p>
                <LegalList>
                    <li>Hosting, database, storage, email, monitoring, and other service providers that operate BacktradeLab for us.</li>
                    <li>Google or Apple when you choose their authentication service, subject to their own policies.</li>
                    <li>PayMongo when you start a hosted checkout. We send the selected plan, server-controlled amount and currency, transaction token, and account contact details needed to process and reconcile the payment. PayMongo handles payment details under its own privacy terms.</li>
                    <li>Courts, regulators, law enforcement, or other parties when disclosure is required by law or needed to protect users, the public, or our legal rights.</li>
                    <li>A successor in a merger, financing, reorganization, or sale, subject to appropriate confidentiality and notice requirements.</li>
                </LegalList>
                <p>Exchange market-data requests include the selected exchange, market, category, timeframe, and candle range. They are used to retrieve public market data and are not intended to include your Google identity or journal content.</p>
            </LegalSection>

            <LegalSection title="6. Cookies and local storage">
                <p>We use essential cookies for authentication, security, CSRF protection, and sessions. We do not currently use advertising or analytics cookies.</p>
                <p>Browser local storage may remember your theme, indicators, candle size, user-scoped tool-setting fallback, active market, replay fallback, watchlist groups, and whether you acknowledged our cookie notice. You can clear browser storage, although doing so may reset local preferences or cause the notice to appear again.</p>
            </LegalSection>

            <LegalSection title="7. Retention and deletion">
                <p>We retain information while your account is active and as reasonably necessary to provide the service, resolve disputes, prevent abuse, enforce agreements, and meet legal, tax, accounting, or security obligations. Retention periods vary by record type. When information is no longer required, we delete, anonymize, or securely dispose of it where reasonably practicable.</p>
                <p>You may request account or Google-linked data deletion by emailing <a href={`mailto:${contactEmail}?subject=BacktradeLab data deletion request`}>{contactEmail}</a> from your account email. We may verify your identity and may retain records that law or legitimate security needs require us to keep.</p>
            </LegalSection>

            <LegalSection title="8. Security and international processing">
                <p>We use administrative, technical, and organizational safeguards designed to protect information, including access controls, authenticated file routes, password hashing, session protections, and restricted administrative actions. No internet service is completely secure. Providers may process information outside your country; where required, we use appropriate contractual or legal safeguards.</p>
            </LegalSection>

            <LegalSection title="9. Your privacy rights">
                <p>Depending on applicable law, including the Philippine Data Privacy Act of 2012, you may have rights to be informed, access your data, object to processing, correct inaccurate data, request erasure or blocking, obtain portable data, seek damages, and file a complaint with the National Privacy Commission. To exercise a right, contact <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. We may ask for information needed to verify your identity.</p>
            </LegalSection>

            <LegalSection title="10. Children">
                <p>BacktradeLab is not directed to children under 18. We do not knowingly create accounts for children. If you believe a child has provided personal information, contact us so we can investigate and take appropriate action.</p>
            </LegalSection>

            <LegalSection title="11. Changes to this policy">
                <p>We may update this policy as the service or law changes. We will post the revised policy here, change its effective date, and provide additional notice when a change is material and the law requires it.</p>
            </LegalSection>
        </LegalPage>
    );
}
