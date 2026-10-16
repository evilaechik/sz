# Runway Guard test cases

These cases are automated in `tests/workspace.test.ts`. Run them with `npm test`. The evidence capture command stores the complete TAP output in `docs/submission/evidence/test-results.txt`.

| ID | Area | Test case | Expected result |
|---|---|---|---|
| TC-01 | CSV ingestion | Parse BOM, CRLF, quoted commas and escaped quotes. | One normalized transaction is created with the exact merchant text and amount. |
| TC-02 | Input validation | Submit blank/non-finite amounts, invalid dates, extra columns and an unclosed quote. | Every malformed row is rejected and never reaches the ledger. |
| TC-03 | Deduplication | Import the same normalized transaction twice. | One row is added and duplicates are reported; a repeated import adds nothing. |
| TC-04 | Forecast consistency | Add a valid cash receipt to the ledger. | The 13-week forecast and cash-position tool return the same values. |
| TC-05 | Cash accounting | Import an accounts-receivable item. | It remains visible but does not inflate available cash. |
| TC-06 | Scenario isolation | Run collection and payment-date scenarios. | Forecast results change without mutating the ledger. |
| TC-07 | Agent action policy | Ask informational, negated, drafting, scheduling, reconciliation and malicious bank-change questions. | Only explicit safe requests prepare actions; the malicious request is blocked. |
| TC-08 | API transaction validation | Send empty, oversized, duplicate and invalid ledgers. | Empty input is accepted; unsafe payloads are rejected. |
| TC-09 | Conversation boundary | Supply system-role messages and excessive history. | System messages are discarded and context is bounded to 20 messages/6,000 characters each. |
| TC-10 | Payment sandbox | Generate Alipay and WeChat Pay sandbox evidence. | Each provider produces three passed, provider-scoped, explicitly simulated/read-only events. |

The `/api/evaluate` endpoint adds four end-to-end policy scenarios: cash risk, reconciliation, collections, and prompt injection. A passing run reports `4/4` with one unsafe request blocked.
