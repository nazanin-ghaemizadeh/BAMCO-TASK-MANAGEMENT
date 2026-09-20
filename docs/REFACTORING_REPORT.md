# Architectural refactoring report

## Scope

This pass consolidated the existing application before further feature work. It preserved the existing product screens, task/approval semantics, role checks, data model, Supabase policies, and first-page card behavior. No framework migration or new product feature was introduced.

## Problems found

- The build graph contained dated “fix”, “root”, “stability”, and “final” layers whose names obscured ownership.
- `fetch` was wrapped independently by the application and session modules, creating order-sensitive transport behavior.
- Navigation was implemented by the application while a late report patch also changed view visibility and installed observers.
- The message renderer injected responsive CSS after startup, making CSS order depend on which module ran last.
- Several GitHub workflows existed solely to mutate source files or apply historical DOM/CSS repair patches.
- Dead or superseded sources remained beside the active implementations.
- Tests and documentation referred to historical filenames instead of responsibility boundaries.
- Large legacy modules still contain global compatibility surfaces and some feature-local observers; these are now visible technical debt rather than hidden behind more patch files.

## Consolidation performed

### New canonical kernel

Added `assets/js/core/application.js` and placed it first in the build. It owns:

- the shared `Bamco.state` namespace;
- named network middleware and raw transport;
- navigation and view lifecycle hooks;
- the application event bus.

`app.js` now delegates navigation to the kernel, and `auth-session.js` contributes one named middleware instead of replacing `window.fetch` itself.

### Responsibility-based source names

Renamed the former dated implementation names into ownership-oriented names:

- runtime, profile, dashboard workload, reports, report dashboard, messages admin, message history;
- task actions and task toolbar;
- Excel export and visual system;
- responsive, stability, and home welcome CSS.

The names now describe where a change belongs. The generated bundles were rebuilt from those sources.

### Patch chain removal

Removed the root synchronization hotfix and the final production report patch after migrating their required navigation behavior into the application kernel and retaining the canonical report implementation. Removed dead `app-update.js` duplicate predecessor, layout-editor v2, report-root-fixes, and task-terminal-columns sources.

Removed the historical mutation workflows and their scripts, including task-table, startup-cache, report-root, photo-workload, login-hotfix, vendor-preview, and vehicle-order repair workflows. The release workflow remains because it performs the legitimate build/test/release process.

### CSS consolidation

Renamed the responsive, stability, visual-system, and home-welcome source files, updated the deterministic manifest, and merged the chat direction/sticker rules into `unified-ui.css`. Removed the message renderer’s late responsive stylesheet injection. There is now one responsive source and one generated CSS artifact.

## Files removed

- `assets/js/root-sync-hotfix-20260917.js`
- `assets/js/final-production-fixes-20260911.js`
- `assets/js/app-update-v2.js` (renamed in place to the active `assets/js/app-update.js` source)
- `assets/js/layout-editor-v2.js`
- `assets/js/report-root-fixes-20260911.js`
- `assets/js/task-terminal-columns-20260912.js`
- historical repair workflow scripts and workflows under `.github/scripts/` and `.github/workflows/` listed in the change set

## Files merged or renamed

The former patch-style files were moved rather than duplicated. The exact source-of-truth list is in `scripts/build-static-bundles.mjs`; generated bundles are synchronized by `npm run build:assets`.

## Behavior intentionally preserved

- Home/dashboard entry behavior and card order.
- Task statuses, selection, Kanban, archive/restore, approvals, roles, people, messages, reports, vehicles, documents, stickers, and Excel contracts covered by the existing tests.
- Existing Supabase schema, RLS, functions, history records, and data semantics.
- Existing version/update behavior, with its source name normalized.

## Verification

`npm ci` completed successfully. `npm run build:assets`, `npm run check:assets`, and `git diff --check` completed successfully after the source manifest was consolidated. The focused architecture/navigation/auth/profile/startup suite passed 56/56. The final regression-budget gate completed with 345/345 passing and no documented baseline exceptions. The isolated 30-tab responsiveness suite passed 30/30; the full gate uses bounded test concurrency and the same performance contract to avoid resource-contention timeouts in the shared runner.

## Remaining technical debt

- A number of legacy modules are still large IIFEs with global compatibility functions; they should be migrated one domain at a time into explicit feature directories.
- Some existing UI modules still use observers/timers for legitimate legacy behavior. They should be registered with lifecycle disposal before being optimized further.

## Final stabilization pass

- Letters now open on a canonical outgoing view in the application shell, while the standalone module keeps its explicit incoming/outgoing picker contract. Row actions are owned by the letters renderer and preserve revision-aware editing and file availability rules.
- People management keeps one eight-column table contract while rendering the confirmed avatar inside the name cell, so profile metadata remains visible without a duplicate avatar column.
- Performance reports use the shared status normalization fallback and count owner create requests over the selected date range; manager metrics retain their monitoring-baseline rule.
- Deleted patch workflows were removed from the active workflow graph, and release/deployment verification now references only current responsibility-based assets.
- Raw Supabase helper calls remain in older feature modules; repository/service extraction should proceed incrementally without changing query semantics.
- CSS has materially fewer late layers, but older selectors and `!important` rules remain in responsive compatibility CSS and should be reduced with browser coverage.
- Six baseline contracts remain outside this consolidation: the letters default-rendering/download fixtures, two people Excel expectations, and the current-month performance denominator fixture. They should be resolved in a dedicated feature-correctness pass rather than hidden in another repair layer.
- The complete browser suite and a production-like console smoke test should be the final release gates.

## Next development phase

Finish the full regression run, then migrate one domain at a time—starting with tasks/requests, then messages/conversations, then reports/people—using the architecture document as the ownership contract. Each migration should remove a superseded global or observer before the next feature is added.
