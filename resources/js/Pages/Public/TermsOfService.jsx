import React from 'react';
import LegalPage, { LegalList, LegalSection } from './LegalPage';

export default function TermsOfService({ legal }) {
    const operator = legal?.operator_name || 'BacktradeLab';
    const contactEmail = legal?.contact_email || 'privacy@backtradelab.com';
    const jurisdiction = legal?.jurisdiction || 'Republic of the Philippines';
    const effectiveDate = legal?.effective_date || 'July 13, 2026';

    return (
        <LegalPage
            title="Terms of Service"
            description={`These Terms govern your access to and use of BacktradeLab, operated by ${operator}.`}
            effectiveDate={effectiveDate}
            icon="terms"
        >
            <LegalSection title="1. Acceptance and eligibility">
                <p>By creating an account, signing in with Google or Apple, purchasing access, or otherwise using BacktradeLab, you agree to these Terms and our <a href="/privacy-policy">Privacy Policy</a>. You must be at least 18 years old and legally able to enter this agreement. If you use the service for an organization, you represent that you can bind that organization.</p>
            </LegalSection>

            <LegalSection title="2. Educational simulation only">
                <p>BacktradeLab is a charting, market-replay, paper-trading, and journaling tool. It does not execute real trades, hold customer funds, operate as a broker or exchange, or provide investment, financial, legal, tax, or accounting advice.</p>
                <p>Market data may be delayed, incomplete, unavailable, or different from executable prices. Simulated results, including profit, loss, fees, fills, and intrabar assumptions, are hypothetical and do not predict future performance. You are solely responsible for real trading and investment decisions.</p>
            </LegalSection>

            <LegalSection title="3. Accounts and security">
                <LegalList>
                    <li>Provide accurate information and keep it current.</li>
                    <li>Keep login credentials secure and promptly report suspected unauthorized access.</li>
                    <li>Use only accounts and social identities you are authorized to use.</li>
                    <li>Do not share, sell, or transfer account access without our written permission.</li>
                </LegalList>
                <p>You are responsible for activity performed through your account unless applicable law provides otherwise. We may require password changes, verification, or other protective measures.</p>
            </LegalSection>

            <LegalSection title="4. Trials, plans, and payments">
                <p>Eligible users may receive a limited replay trial. Paid plans are one-time, non-renewing purchases processed on PayMongo's hosted checkout. Prices, currencies, durations, and available payment methods are shown before checkout. Replay access is granted only after BacktradeLab verifies a successful provider payment; a browser return or screenshot alone does not activate access.</p>
                <p>Test-mode checkout may be offered in local or staging environments. Test transactions move no real money but may activate replay access in that non-production environment for testing. Production checkout remains unavailable until live payments are deliberately enabled.</p>
                <p>Fees for access already granted are non-refundable, except where (a) you were charged more than once for the same order (a duplicate or double payment), or (b) a payment processing error caused an incorrect charge. In those cases, contact <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or submit a support request with both transaction references, and we will refund the erroneous or duplicate amount once verified. Approved refunds are typically credited back to your original payment method within 2-3 business days, though your bank or payment provider may take longer to reflect it. Outside of these exceptions, and unless a mandatory consumer law requires otherwise, no refund is available for change of mind, unused access, or dissatisfaction with simulated results. If we approve a refund, we may revoke or adjust the related access. Plan availability, pricing, and features may change prospectively; changes do not reduce an already approved access period unless required to address misuse, law, or security.</p>
            </LegalSection>

            <LegalSection title="5. Acceptable use">
                <p>You must not:</p>
                <LegalList>
                    <li>Break the law, infringe rights, harass others, or upload malicious, deceptive, or unlawful content.</li>
                    <li>Probe, bypass, disable, or interfere with security, access controls, rate limits, subscriptions, or service integrity.</li>
                    <li>Use bots, scraping, or excessive automated requests except through an interface we expressly authorize.</li>
                    <li>Reverse engineer the service except where the law expressly permits it.</li>
                    <li>Misrepresent simulated results as guaranteed or verified real-world performance.</li>
                    <li>Upload snapshots or other content containing information you have no right to use.</li>
                </LegalList>
            </LegalSection>

            <LegalSection title="6. Your content">
                <p>You retain ownership of lawful content you submit, such as drawings, journals, feedback, snapshots, and attachments. You grant {operator} a non-exclusive, worldwide, royalty-free license to host, copy, process, display, and transmit that content only as needed to operate, secure, support, and improve the service and comply with law. You represent that you have the rights needed to provide the content.</p>
                <p>Feedback and suggestions may be used without restriction or compensation, provided we do not publicly identify you without permission.</p>
            </LegalSection>

            <LegalSection title="7. Our service and third parties">
                <p>BacktradeLab and its software, design, branding, and documentation are owned by {operator} or its licensors. These Terms grant only a limited, revocable, non-transferable right to use the service.</p>
                <p>The service relies on third parties such as Google, Apple, market-data exchanges, hosting providers, and PayMongo. Their services and terms are separate from ours. We are not responsible for third-party outages, decisions, data, or content beyond the responsibility imposed by law.</p>
            </LegalSection>

            <LegalSection title="8. Availability, changes, and termination">
                <p>We may maintain, update, suspend, or discontinue features. We do not guarantee uninterrupted service, retention of every local preference, alert delivery while you are offline, or permanent availability of exchange data.</p>
                <p>You may stop using the service at any time. We may restrict or terminate access for material or repeated violations, fraud, security threats, legal requirements, nonpayment, or conduct that risks harm to the service or others. Provisions that by nature should survive termination—including ownership, disclaimers, liability limits, and dispute terms—will survive.</p>
            </LegalSection>

            <LegalSection title="9. Disclaimers and limitation of liability">
                <p>To the maximum extent permitted by law, the service is provided “as is” and “as available,” without warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, profitability, or uninterrupted availability.</p>
                <p>To the maximum extent permitted by law, {operator} and its personnel will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost trading opportunities, market losses, or lost data arising from the service. Our aggregate liability for claims relating to the service will not exceed the amount you paid to us for the service during the six months before the event giving rise to the claim. These limits do not exclude liability that cannot legally be excluded.</p>
            </LegalSection>

            <LegalSection title="10. Indemnity">
                <p>To the extent permitted by law, you agree to defend and indemnify {operator} against third-party claims, damages, and reasonable costs arising from your unlawful use, your content, or your material breach of these Terms. This obligation does not apply to the extent a claim was caused by our own unlawful conduct.</p>
            </LegalSection>

            <LegalSection title="11. Governing law and disputes">
                <p>These Terms are governed by the laws of the {jurisdiction}, without regard to conflict-of-law rules. Before filing a claim, you agree to contact <a href={`mailto:${contactEmail}`}>{contactEmail}</a> and attempt in good faith to resolve the dispute informally for 30 days. Courts with lawful jurisdiction in the Philippines will hear unresolved disputes, subject to mandatory consumer rights and venue rules.</p>
            </LegalSection>

            <LegalSection title="12. General terms and changes">
                <p>If a provision is unenforceable, the remaining provisions continue in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them as part of a reorganization, financing, or transfer of the service.</p>
                <p>We may update these Terms. We will post the revised version and effective date and provide additional notice for material changes where required. Continued use after the effective date means you accept the updated Terms. Contact <a href={`mailto:${contactEmail}`}>{contactEmail}</a> with questions.</p>
            </LegalSection>
        </LegalPage>
    );
}
