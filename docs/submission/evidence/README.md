# Execution evidence

This directory contains machine-readable and human-readable evidence generated from the Runway Guard local demo.

- `control-evaluation.json`: four deterministic agent-policy scenarios from `POST /api/evaluate`.
- `sandbox-operation-log.json`: simulated Alipay and WeChat Pay merchant-profile, settlement-summary and signed-callback checks.
- `test-results.txt`: complete output from the automated test suite.
- `submission-evidence.json`: combined manifest with repository, environment, safety statement and all results.

Regenerate the files with `npm run evidence` while the local API is running. All payment-provider events are simulations. They do not use production credentials, customer data, email delivery, ledger posting or payment movement.

The required demo video is submitted separately and should show the same controls in the interface: a cash-risk analysis, an approval-gated draft, a blocked bank-detail instruction, both sandbox runs, and the audit/evidence export.
