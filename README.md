# Runway Guard

Competition prototype for the FinTechathon International Track, Topic E: Small-business Finance Assistant.

Runway Guard is a conversational cash-flow copilot for a small business. The current build uses synthetic source data, browser-local imports, and simulated financial actions.

## Demo story

The Harbor & Bean owner discovers a projected cash shortfall. Runway Guard then:

- surfaces a 13-week cash forecast and the at-risk week;
- recommends collecting an overdue invoice and moving a lower-priority supplier payment;
- requires owner approval before an action can be scheduled;
- rejects a suspicious supplier bank-change request; and
- records prepared actions, tool results, owner decisions, and outcomes in an exportable local audit trail.

## Deployment and local run

Prerequisites: Node.js 20.19 or newer and npm. The application is designed for a local competition demo and binds its API to `127.0.0.1`; it is not a production multi-user deployment.

```bash
npm install
npm run build
npm run dev:full
```

Open `http://127.0.0.1:5173`. The agent API runs at `http://127.0.0.1:8787`; `GET /api/health` confirms its status.

To enable the OpenAI planner, copy `.env.example` to `.env` and add a server-side API key. The key is not exposed to the browser. Without a key, the deterministic local tool agent runs. The UI labels this fallback as offline rules.

Never commit or submit `.env`. The included `.env.example` contains names only, not credentials.

## Verification and test cases

```bash
npm run lint
npm test
npm run check:server
npm run build
```

The automated suite covers CSV parsing and rejection, duplicate imports, 13-week forecast consistency, receivable/cash separation, scenario immutability, explicit action preparation, unsafe instruction blocking, API payload validation, bounded chat history, and provider-scoped sandbox evidence. See `tests/workspace.test.ts` and `docs/submission/runway-guard-test-cases.md`.

To regenerate the submission evidence while the API is running:

```bash
npm run evidence
```

This writes deterministic test output, the four-case policy evaluation, and simulated Alipay/WeChat Pay operation logs to `docs/submission/evidence/`. It does not call a live payment provider or include an API key.

## Five-minute demo

1. Open **Overview**, hover the 13-point forecast, then open **Cash flow** and compare baseline, collection, and payment-date scenarios.
2. Open **Integrations** and import `public/runway-guard-test-import.csv` or `public/sample-transactions.csv`. The import reports accepted, duplicate, and rejected rows. Return to Overview to see cash and forecast update. Imports remain in this browser after refresh.
3. In **Agent workspace**, ask “Draft a Northstar reminder.” Inspect and edit the draft. Confirm the prepared local action, or type “go ahead”; no email is sent. Ask a follow-up such as “What amount was in that draft?” to demonstrate conversation context.
4. Ask “Prepare the BeanWorks payment-date reschedule.” Confirm it, inspect **Approvals**, and use **Undo simulation**. Ask about an unverified bank-detail change to show the blocked tool path.
5. Open **Reconciliation** to review an uncategorized row. This records a human category review; it does not invent a match confidence or post a ledger entry. Open **Audit log** to export the event trail.
6. Switch to Chinese with the language button. In **Integrations**, run the WeChat Pay and Alipay simulations if you want sandbox evidence for the presentation.

## Current scope

The 13-week forecast uses explicit illustrative weekly assumptions anchored to October 7, 2026. Net imported cash transactions adjust opening cash; invoice and receivable categories stay visible but do not count as settled cash. The forecast is not an audited bank balance or a prediction trained on a business's actual history. A confirmed action only updates the local approval state; it does not change cash, send a message, move money, or post to accounting. WeChat Pay and Alipay checks are simulations, not merchant connections. Live merchant integrations would require the correct merchant account, consent, credentials, certificates, and provider-specific verification.

Browser storage preserves the local ledger, chat, draft, approvals, and audit events. It is scoped to that browser profile rather than a multi-user backend. The app sends the current transaction ledger and recent chat to the configured OpenAI model when a user asks it a question. Do not use real customer data in this prototype.

## Architecture and safety

- The browser calls `/api/agent`; finance tool execution happens on the server.
- The allowlist only permits cash analysis, reconciliation review, a collection-reminder draft, a simulated supplier payment-date schedule, and a security review.
- The agent cannot send the draft, post to a ledger, move money, or accept a bank-detail change.
- Consequential results appear as explicit action previews with Confirm and Cancel. The API returns the prepared action in a structured field; browser code does not infer a transaction from prose.
- `POST /api/evaluate` runs four deterministic local checks, including a policy-override case. It is a demo control check, not a third-party security certification.

## Submission materials

- Technical documentation: `docs/submission/runway-guard-technical-documentation.docx`
- Technical documentation PDF: `docs/submission/runway-guard-technical-documentation.pdf`
- Security self-assessment: `docs/submission/runway-guard-security-self-assessment.docx`
- Security self-assessment PDF: `docs/submission/runway-guard-security-self-assessment.pdf`
- Test case index: `docs/submission/runway-guard-test-cases.md`
- Execution evidence: `docs/submission/evidence/`
- Competition presentation: `docs/submission/presentation/runway-guard-competition-deck.pptx`
- Demo-video recording script: `docs/submission/demo-video-script.md`
- Demo screenshots: `output/playwright/`
