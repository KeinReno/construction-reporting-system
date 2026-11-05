# CRS AI runtime — optional backend GPT (4 November 2026)

## What exists in branch

- Read-only local analytics: `POST /api/v1/analytics/ask`, fully deterministic. Always available with a working CRS API.
- Optional external summarizer: `GET /api/v1/ai/status` and `POST /api/v1/ai/chat` **for manager/admin only**. External code in `backend/app/ai_provider.py`; Web interface `web/src/AnalysisPanel.tsx`.
- **Defaults OFF.** No API key, no customer permission, or blocked model → Web explicitly shows «GPT пока не подключён» and uses local analytics. Do not spoof GPT.
- GPT does NOT directly read DB, have SQL, change reports or access photos. Backend uses ACL-filtered summary, sends an allowlist of aggregate fields, and supplies source IDs from server query rather than from generated model text.

## Operator-only configuration (private environment, never GitHub)

Set all of the following in the runtime process environment **only after written B13 approval**:

```text
CRS_AI_EXTERNAL_ALLOWED=1
CRS_AI_DATA_POLICY_APPROVED=1
OPENAI_API_KEY=<secret set outside repository, never in command history>
CRS_AI_MODEL=gpt-6-luna
CRS_AI_DAILY_LIMIT=20
```

Model allowlist: `gpt-6-luna`, `gpt-6.1-terra`, `gpt-6.1-sol`. Existence of a valid key and the toggle is only a *configuration indicator*, not proof the provider is reachable. HTTP implementation uses `POST https://api.openai.com/v1/responses`, `store:false`, max 700 output tokens and network timeout, with no arbitrary redirects. No streaming currently.

## What leaves the customer environment

- User-typed question (up to 800 chars). **The question may itself contain confidential data**; operator must explain this to the user.
- Limited server-produced summary: report counts, no-work/incident counts, up to 35 types of work volume, financial totals by operation kind, equipment aggregates, material movements and up to 40 day-counts.
- **Not sent:** raw reports, source report UUIDs, site UUIDs, photos, employees, passwords, auth tokens, incident descriptions or free-text reasons.
- Client-side local chat history is session-memory only, and is **not** shared with provider between calls in this version. Follow-up questions are stateless.

## Safety caveats / production blockers

- This is a **first-stage GPT summarizer**, not a finished fully agentic multi-tool system. It cannot yet formulate a plan of queries or run follow-up read-only tools.
- `CRS_AI_DAILY_LIMIT` uses **per-process in-memory** accounting. Production with multiple workers/instances requires persistent atomic quotas and actual API billing telemetry; the runtime currently uses one worker.
- Cost may vary, tokens are charged by the external provider separately from ChatGPT Plus. Hard monthly USD cap and central billing monitoring must be configured before a customer deployment.
- Actual data-processing agreement, retention/residency, allowed country, and model choice require customer approval. `store:false` is a request setting; it is **not** a blanket promise of zero data retention by the provider.
- GPT text is not evidence. UI shows source records from the same permitted scope, not model-fabricated citations. Do not claim each sentence individually cited.
- Pending: live provider smoke test on separate synthetic data, real policy review, model timeouts/retries, quotas across restarts and workers, redaction assessment, golden-question evaluation, abuse controls, cost alarms, production secure secret store.

## Verification

Run `python -m pytest -q tests/test_ai_provider.py` from `backend`, then full backend tests and Web E2E on a **synthetic** database. `web/tests/ai-workspace.spec.ts` verifies no false GPT status, source navigation and mobile width. Enable OpenAI only for a separate explicitly approved smoke test with test aggregate data. Never use a real customer corpus to debug external integration.

Official API reference: https://developers.openai.com/api/reference/resources/responses/methods/create .
