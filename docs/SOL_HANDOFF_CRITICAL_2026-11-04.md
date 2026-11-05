# Sol / Work — CRS integration handoff, 4 November 2026

## Objective & scope

Target: **live Android → laptop-hosted CRS → two synchronized Web views** for meeting at **11:00 МСК, 04.11.2026**. Second target: reliable analytics and a professional AI workspace (not a fake GPT).

Repository: `KeinReno/construction-reporting-system`.
- Reviewed source: `codex/owner-simplified-20261103` at `344cb13ee8924f2b0e8e6b26acd6183060a4f991`.
- Rina handoff branch: `feat/crs-demo-readiness-20261104`.
- Source Web V4: `feat/crs-web-workbench-v4`; newer owner's UX derives from this, currently not merged into `main`.
- Branch integrity: **no reset --hard, no force push, no silent merge**; inspect `git status`, `git branch -avv`, current runtime and existing local modifications before code changes. Work in a new worktree.

## Priority P0 — make live demo executable

1. **Inspect notebook:** Windows version, absolute repository/runtime paths, Python 3.12, Node, SSL tunnel, internet, free disk, Android USB/connectivity. Copy prior private DB/media via consistent backup/restore; if absent, prepare an explicitly synthetic separate demo DB rather than silently claiming full history. Never commit real assets/credentials.
2. **Compare exact build:** Android standard non-demo package `com.kaiden.construction`, `DEMO_MODE=false`, `versionName=0.4.1` in 31.10 source. Debug APK from Actions exists. Demo APK `com.kaiden.construction.demo` **does not sync** and must not be shown as live delivery.
3. **Web:** build from newest owner branch, copy to private `WEB_DIR`; single backend database `127.0.0.1:58494`. The special Vite `58495` employee preview proxies the same API only if explicitly configured and is not a replacement backend.
4. **HTTPS:** Android rejects HTTP. Laptop loopback is inaccessible from phone. Existing `srv.us` reverse SSH tunnel provides HTTPS if operational, otherwise use a separately tested secured HTTPS ingress. Check from physical phone on LTE/5G. SecureSession binds endpoint after login; preserve drafts.
5. **Accounts:** foreman must have Assignment to same site that manager sees; verify both credentials. Do not use public demo credentials on private imported data.
6. **Actual E2E:** send unique report from Android, wait for receipt, Web desktop refresh/open same report, mobile Web refresh/open SAME ID and photo. Confirm status/revisions. Test no duplicate on retry. Client failure is **NO-GO** (use fallback archived Web).
7. **Run script:** `powershell -ExecutionPolicy Bypass -File scripts/demo/Test-LiveDemo.ps1 -HttpsBase https://<current-host> -WithAuth`. It checks connectivity and roles, NOT live send.
8. **Record proof:** local `/ready`, remote `/ready`, client login, report UUID, receipt UUID, photo HTTP 200 after auth, screenshots on 1440/390, Android delivery state, versions and SHA256. Redact all secrets and private material in any external output.
9. **Stop-Start test:** stop only current runtime and restart with same config. After reboot/phone airplane mode, verify queue and delivery when network is back. Avoid modifying the customer's real data to test.

## P1 — analytics integrity, data provenance, business semantics

10. Audit import against **original** MAX archive: previous status 94 reports and 247 photo links / 237 unique files, but full corpus is private and completeness not proven. Cross-check at least 10 originals, 3 ambiguous site records, dates, author, photo same-message vs same-date; no guesses. Compare monetary text mentions to structured financial entries. Never turn *mentioned* into *received* or *consumed* without evidence.
11. Metrics must distinguish **unknown vs 0**: no initial money balance, no approved plan, no shift schedule → no fabricated balance/percent-completion/overdue. Currency calculation in integer kopecks/Decimal; separate expenses, funding, advances. Volume units must not be summed across incompatible units.
12. OwnerActivity monthly bar chart currently uses *last six months with reports*; patch to show **six consecutive calendar months** with zero-report gaps explicit, and retain links to original months only when data exists.
13. Add deterministic golden fixtures with two sites and dates, receipt/draft/review, 1 material mention (not movement), 1 actual receipt and expense, 1 same-day-unconfirmed photo and 1 verified photo, one missing month, different units, no plan and no initial money amount.
14. Audit pagination >200 reports; verify owner can reach all sources across date filters. Confirm historic archive is not treated as 'currently overdue'.

## P2 — AI product and implementation

15. Current `web/src/AnalysisPanel.tsx` uses only `POST /api/v1/analytics/ask` (deterministic backend), NOT GPT. Current UI is a form/select with unordered result list, visually incomplete.
16. New screen structure: command header + model status ('Локальная аналитика' / 'GPT подключён') + scope filters + suggested questions + chat conversation + evidence/results pane with numeric cards, source links, flags 'подтверждено/требует проверки/нет данных', accessible keyboard, responsive mobile. Do not show fake model identity or fake response.
17. Backend **never gives model SQL access or ability to modify data**. All metric computation/permissions must run through approved CRS functions. If OpenAI integration is enabled after B13 approval, expose a separate protected endpoint and use environment secrets, limited requests, timeouts, budget caps, and no persistence of sensitive prompts on third-party side when available. Send minimized metrics rather than raw messages/photos; get separate permission for any external data processing. GPT Plus is not an API credential.
18. Test 8 golden user questions: dates, volume, no work, finance, units, ambiguous source, empty range, prompt injection from source text; reference IDs must come from validated backend records, not generated text. Simulate provider failure, exhausted budget and disabled key; local analytics must continue without hidden fake GPT.
19. **Do not deploy untested new AI at the expense of live report delivery.** AI UI should be real polished even while external provider is disabled.

## P3 — production deployment after live demo

20. Survey **actual** customer's Windows host (not this laptop): Windows edition, CPU/RAM/disk, access, firewall, backups, no public DB port. Prepare PostgreSQL, Caddy/HTTPS, private uploads, least-privileged runner, process restart, monitoring, backup+restore validation, releases and rollback.
21. Test actual customer's network on employee mobile and manager mobile, with/without VPN; document RPO/RTO, site policies, who manages SSL and renewals, what is personal data; obtain sign-off.

## Validation commands, mandatory

```powershell
cd web
npm ci
npm run build
npx playwright test --timeout=30000
npx playwright test -c playwright.employee.config.ts

cd ..\backend
..\.venv\Scripts\python.exe -m pytest -q
```

**Tests are not a replacement for real phone E2E.** Confirm the same base URL, SQLite/pg target and work_date. Do not run test suites against the private customer runtime.

## Output expected from Sol

- Verifiable **GO / NO-GO** (all P0 gates explained, not generic PASS).
- Exact code commit(s), branches, test results, artifact SHA256, screenshot files.
- Working Android APK build and Windows local runtime launch procedure for notebook.
- Written defects with severity and responsible next action.
- AI screen code/screenshots and backend integration plan; mark actual GPT provider as BLOCKED until external-data consent/API key and non-failing acceptance tests.
- No automatic merge/release or publishing secrets.

## Hard truths for the meeting

No confirmed current GPT integration. Windows production server not deployed. Current Web requires refresh to fetch new reports unless separately implemented/tested. Android DEMO does not sync. Local preview through srv.us may fail from some mobile networks. 94 imported records are history, not live discipline, and old photos may be linked by date only. Reject pressure to hide any of these facts.
