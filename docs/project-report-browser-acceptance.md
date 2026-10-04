# Project/report real-browser acceptance

## Scope and isolation

Run the shipped production HTML, CSS, scripts and CSP in Chromium. The browser
uses eight fresh contexts: desktop (1365 × 900) and touch/mobile (390 × 844), each
with ordinary-project, legacy-capability, timeline-only and performance-only
synthetic actors. Timeline and performance actors have different fixture IDs.
All identities, grants, projects, tasks and report rows are invented in
`tests/browser/mock-project-report-api.js`. No production login, user records,
audit records or schema snapshots are included or required.

The Python runner serves only the checkout on an ephemeral loopback port. The
existing mock API intercepts fetch; the additional fixture owns only project and
report endpoints. Browser context routing blocks every non-loopback-origin
request (including redirects, XHR, images and workers); service workers are
blocked and WebSockets are intercepted and closed. Production assets and CSP are
not rewritten. No external credentials or CI secrets are used.

Ordinary form and navigation interactions use visible real controls. Test hooks
only seed synthetic data, inspect cache invariants, hold detached response
payloads and inject account/access lifecycle events through the real resolver.
Timeline refresh uses its actual lifecycle callback because it has no visible
refresh button. The existing shared `home` helper returns via the app's home API.
No authorization resolver, business method, CSS or report renderer is replaced.

The fixture is deliberately **not evidence of database authorization**. Positive
legacy hints represent a server-authorized project relationship and organizational
or task-linked authority. Their UI cases prove existing protected RPC paths and
approval-pending behavior remain usable; the separate SQL and native-session
acceptance establishes real policy/trigger authority. This fixture cannot replace
those tests or prove live organization routing.

## Acceptance assertions

- Foreign ordinary project title/description/priority edits use the six-field
  metadata RPC, preserve ownership and block a second submit while pending
- Cancel and close retain the previous data, route and browser history
- Ordinary project creation is self-owned; phase create/edit/delete, milestone
  date-picker and dependency creation use the narrow endpoints
- Foreign project deletion, activity create/edit/delete and owner transfer
  controls remain disabled without protected hints; activity detail is readonly
- Positive legacy activity create/edit/delete and whole-project deletion invoke
  the existing approval RPCs and leave business rows unchanged while pending
- Authorized owner transfer uses the existing raw project update path
- Regranting ordinary project access does not enable protected controls; revoked
  mutations and old-account project read responses cannot refill the workspace
- Each report opens with its own view grant and without Kanban, approvals,
  archive, dashboard, access-matrix or the other report grant
- The guide remains view-only for these non-admin actors
- Foreign timeline rows open readonly details from calendar, Gantt and
  unscheduled views; no input/form/task mutation or Kanban navigation is exposed
- Performance renders active and archived task metrics and aggregate definition
  counts without querying the approvals snapshot
- Personal task, workflow and profile caches remain byte-equivalent after report
  loading and repeated refreshes; report-only people never enter that directory
- Late older successes cannot overwrite newer renders; malformed/failed report
  payloads clear report cache and a retry recovers
- Navigation away during a held response stays home and reopening is valid
- Grant revocation clears open details and data; late replies after revocation,
  account switching or account deactivation cannot restore report caches
- All cases reject unhandled JavaScript errors, expired response gates and
  page-level horizontal overflow

## Reproduce

Use Node 24 and Python 3.12, as in the existing read-only workflow:

```sh
npm ci
npm run build:assets && npm run check:assets
node --test tests/project-report-browser-fixture.test.cjs
python -m pip install playwright==1.62.0
python -m playwright install --with-deps chromium
python tests/browser/check_project_report_scope.py
```

An already installed Chromium can be selected with `CHROMIUM_PATH`. Results and
screenshots are written to `test-results/project-report-scope/`. The runner exits
nonzero unless all eight contexts finish successfully. The existing
`report-invoice-files-browser.yml` job runs this after invoice/report-file
acceptance with the same browser dependency and uploads a separate
`project-report-scope-acceptance` artifact. The additions change no permissions,
services, credentials, production deployment or database application step.

## Authoring verification (not a browser result)

- Python compilation and JavaScript syntax passed
- Five new fixture contract tests passed
- Thirteen existing project/report cache and UI tests passed
- Generated asset consistency passed
- Chromium **not run locally**: this execution environment is known to deny the
  Unix socket operation needed by the browser runner; no repeated escalation or
  alternative browser launch was attempted
- Desktop/mobile screenshots, geometry and interaction assertions remain
  **unverified until the exact integrated revision runs in CI**. Review uploaded
  screenshots before calling browser/visual acceptance complete

The tests do not prove a real Supabase deployment, real login/account switching,
real PostgreSQL concurrency or production grant changes. No database proposal is
applied by this harness.
