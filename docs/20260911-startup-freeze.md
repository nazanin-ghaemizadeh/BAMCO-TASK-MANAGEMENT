# Startup freeze investigation — 2026-09-11

Baseline: 3cd79ba404519bdcf1bc7cc6259e497bcc089406 (the deployed Pages artifact was downloaded and inspected).

## Reproduced causes

- `messages-admin.js`: the former observer on `templatesView` called `removeTemplateHelp`, which unconditionally assigned `textContent` on `openDesktopTemplateEditor`. Assigning even the same text replaces the text node, schedules another mutation, and starves the browser event loop. The unmodified page did not reach `load` within the six-second Chromium test limit. A separate diagnostic instrument counted 251 callbacks before deliberately disconnecting the observer. The request export label had the same self-triggering pattern.
- `runtime.js`: mobile sidebar normalization unconditionally removed classes while observing the sidebar's own class/style attributes. Mobile startup also timed out until these writes were made conditional.
- `report-root-fixes-20260911.js`: the response delete label was rewritten on every observer pass, scheduling continuous 30 ms reconciliations. Its independent row-click listener was also blocked by the application's earlier capture-phase table-selection handler. Thus the delete action did not become enabled.

## Changes

Observer callbacks now change text/classes/styles only when a value actually differs. The redundant sticker warmup loop was removed; the sticker manager retains its existing authenticated preload. Response deletion subscribes to the existing selection event and uses stable delivery IDs; cancel/failure restores the button and does not remove UI rows before server confirmation. The dashboard card updater no longer changes canvas height after painting. All changed runtime assets receive new query versions in index.html.

No production task, message or account was deleted or modified during the tests. The database function definition was read to check its contract; no database migration was applied in this repair.

## Regression coverage

`tests/browser/run_smoke.py` uses a real Chromium browser and synthetic manager/owner API fixtures. It exercises desktop (1365 px) and touch/mobile (390 px) entry, the actual login form including numeric verification, home navigation, role visibility, the template dialog with a delayed API, request-report idle stability, response single/multiple deletion including cancel and server failure, performance date controls/borders, sticker images, dashboard canvas, Kanban and archive. It asserts the event loop remains responsive and collects uncaught JavaScript errors.

The four offline Chromium cases passed locally, with no uncaught JavaScript errors. The offline mode inlines assets into a test document because browser networking is disabled in that environment; it does not validate network loading or CSP. The separate Browser startup regression workflow runs the normal HTTP page with the production CSP intact. API responses remain mocked in both modes: these are UI/runtime regression tests, not proof of a real user's production authentication or database permissions.

Run the standard browser check:

```sh
python -m pip install playwright==1.57.0
python -m playwright install --with-deps chromium
python tests/browser/run_smoke.py
```

For a network-disabled browser environment with system Chromium, use `--offline`. Results and screenshots are written to `test-results/browser/`.
