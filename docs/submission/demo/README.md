# Runway Guard product demos

The two videos are recordings of the real local product with OpenAI-generated voice-over, burned-in captions, natural cursor motion, and click feedback. No interface or financial outcome is fabricated.

## Files

- `runway-guard-product-demo.mp4` — final H.264/AAC demo
- `runway-guard-product-demo-poster.png` — poster frame showing the prepared action and human-confirmation control
- `runway-guard-demo-captions.srt` — accessible caption sidecar
- `runway-guard-demo-narration.txt` — editable narration source
- `../../../videos/demos/runway-guard-approval.mjs` — deterministic browser take
- `runway-guard-integrations-demo.mp4` — 29-second H.264/AAC data-integration and China-readiness feature tour
- `runway-guard-integrations-demo-poster.png` — poster frame showing the Chinese sandbox-evidence result
- `runway-guard-integrations-demo-captions.srt` — accessible caption sidecar
- `runway-guard-integrations-demo-narration.txt` — editable narration source
- `../../../videos/demos/runway-guard-integrations.mjs` — deterministic browser take

## Story shown

1. The dashboard exposes a projected $3,840 cash-buffer gap.
2. The user opens the Runway Guard agent workspace.
3. The agent reads the current ledger and explains the payroll risk.
4. The agent prepares, but does not send, a Northstar collection reminder.
5. The owner reviews and confirms the prepared local-simulation action.

The companion integrations video shows:

1. banking, Stripe, and accounting demo adapters in one workspace;
2. a real ten-row CSV upload increasing the analyzable ledger from 4 to 14 transactions;
3. the complete Simplified Chinese interface; and
4. six provider-scoped WeChat Pay and Alipay sandbox checks, with no production credentials or live payment movement.

## Re-recording

Start the product first:

```bash
npm run dev:full
```

Use the [Paralect Product Demo skill](https://www.paralect.com/skills/product-demo) and its `scripts/record.mjs` recorder:

```bash
PLAYWRIGHT_CORE=/path/to/playwright-core node /path/to/video-demo/scripts/record.mjs \
  --take videos/demos/runway-guard-approval.mjs \
  --out out/runway-guard-approval \
  --width 1600 --height 900 --pad 28 --scale 2 \
  --wallpaper cool --fps 30 --out-width 1920
```

The narration was produced from `runway-guard-demo-narration.txt` with the installed `demo-video` skill. Pass `OPENAI_API_KEY` only through the environment; never put it in the take or narration file. The caption sidecar is suitable for YouTube, LinkedIn, or competition-platform uploads.

Record the integrations companion by replacing the take with `videos/demos/runway-guard-integrations.mjs`. Its narration source is `runway-guard-integrations-demo-narration.txt`.
