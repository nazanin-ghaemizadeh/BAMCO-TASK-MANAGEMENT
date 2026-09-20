# BAMCO application architecture

This document describes the consolidated vanilla-JavaScript architecture. The application remains a static browser application backed by Supabase; generated bundles are deployment artifacts, not editable source.

## Boot sequence

1. `index.html` loads the generated CSS bundle and the single generated JavaScript bundle, plus the small version updater.
2. `assets/js/core/application.js` creates the `Bamco` namespace, shared state, the named network middleware pipeline, and the navigation lifecycle.
3. The bundle loads shared renderers, services, shell code, domain modules, and feature modules in the deterministic order declared by `scripts/build-static-bundles.mjs`.
4. `assets/js/app.js` restores the session, configures view titles, binds the application shell, and exposes the existing domain actions.
5. `assets/js/auth-session.js` registers the single authentication middleware and owns refresh, expiry, logout, and password-change session behavior.
6. Feature modules render only after their view is opened or the existing startup warm-up explicitly requires it.

The updater (`assets/js/app-update.js`) is deployment hygiene. It does not repair application DOM or rebind feature behavior.

## Directory responsibilities

| Location | Responsibility |
| --- | --- |
| `assets/js/core/` | Application kernel: shared state, navigation, lifecycle, event bus, and network pipeline. |
| `assets/js/` shared modules | Cross-feature rendering, media, tables, Excel, shell, session, and UI behavior. |
| `assets/js/` domain modules | Tasks, requests, reports, people, messages, conversations, vehicles, documents, stickers, and settings. |
| `assets/css/` | Source stylesheets. `app.css`, `unified-ui.css`, `responsive.css`, and the named component/page styles are inputs to the generated CSS bundle. |
| `scripts/` | Deterministic asset generation and validation. |
| `supabase/` | Database migrations, functions, and server-side authorization/data behavior. |
| `tests/` | Behavioral and architectural regression contracts. |

Responsibility-based names are intentional. Files formerly named as dated fixes were renamed into their actual ownership area; no new patch layer was introduced.

## Module boundaries and ownership

- Tasks own task CRUD, task selection, statuses, priorities, assignment, Kanban, archive/restore, and task history entry points.
- Requests and approvals own request generation, approval transitions, routing, and request history.
- People owns people/profile administration and profile presentation.
- Messages and conversations own message rendering, conversation state, notifications, stickers, and message history.
- Reports consume normalized task/request/message data and do not redefine task status semantics.
- Vehicles, documents/sites, stickers, Excel, and settings own their own domain workflows.
- Shared table, dialog, toast, form, date, formatting, and media behavior belongs in the shared modules and is consumed by domains.

When a concern spans domains, the shared owner is extended first. A second renderer or a post-render repair script is not an acceptable boundary.

## Navigation lifecycle

`BamcoNavigation.navigate(view)` is the canonical transition path:

```text
navigate
  -> dispose previous registered view
  -> emit navigation-before
  -> update shared state and visible view
  -> activate registered view
  -> emit navigation-after
```

Existing `showView` calls remain compatible and delegate to this lifecycle. Views may register `activate` and `dispose` handlers through `BamcoNavigation.registerView`; local events must be removed by the disposer. A module must not hide or rewrite another view after it has rendered.

## State ownership

- Server state is held in the shared `Bamco.state` model after the existing data loaders normalize it.
- Application state includes the authenticated user/profile, selected view, tasks, requests, profiles, and request routing data.
- Transient UI state belongs to the owning feature (selection, open dialog, pending upload, filters, and pagination).
- Persisted local state is limited to existing browser storage contracts such as update/session markers and user preferences.

There should be one in-memory owner for a domain collection. A feature may derive a filtered view locally, but it must not create a competing authoritative copy.

## Data access and authentication

The browser uses the existing Supabase REST/RPC helpers and edge functions. `app.js` remains the compatibility surface for the current helpers; domain code should call the relevant helper/service rather than inventing a new transport.

`BamcoNetwork` is the single request pipeline. `auth-session.js` contributes the `auth-session` middleware and uses the kernel's raw transport only for refresh/logout requests, avoiding recursive middleware calls. Other middleware must be named, composable, and registered once.

`window.bamcoAuth` is the canonical session surface for snapshot, refresh, clear, logout, and password change. UI role checks control presentation only; Supabase functions and RLS remain the security boundary.

## UI architecture

The application continues to use its established internal-page visual language. Shared CSS and existing shared helpers own buttons, inputs, tables, toolbars, dialogs, badges, status colors, and responsive behavior. Feature CSS contains only genuinely feature-specific layout.

The message renderer no longer injects a second stylesheet after startup. Responsive CSS is embedded once by the asset build. Late DOM mutation is allowed only for a feature's own content and only when it is part of that feature's normal render path.

## CSS architecture

The canonical layers are:

1. base/layout and domain source styles (`app.css`, page/domain files);
2. shared visual system (`visual-system.css`, `unified-ui.css`, `stability.css`);
3. responsive rules (`responsive.css`), embedded once through `department-entry.css` by the build;
4. the final home-specific layout (`home-stable.css`, `home-welcome.css`).

Tokens and shared control geometry stay centralized. New `!important` rules or page-specific copies of shared controls require a demonstrated browser constraint and should be avoided.

## Build and generated assets

`scripts/build-static-bundles.mjs` is the source-of-truth manifest. Run:

```bash
npm run build:assets
npm run check:assets
```

The script deterministically produces `assets/js/bamco.bundle.js` and `assets/css/bamco.bundle.css`. Generated bundles must never be edited by hand. CI should build, check, and test from source.

## Test strategy

Behavioral tests protect existing product workflows. Startup tests protect the single entrypoint, source order, generated bundle synchronization, and the absence of the old repair paths. Focused tests should be run while migrating a domain; the complete `npm test` suite is the final gate.

## Adding a future feature

1. Define the domain owner and its server-state shape.
2. Add or extend one service/helper boundary for data access.
3. Add the view renderer and local event lifecycle in the owning feature.
4. Register navigation and disposal through the core lifecycle.
5. Reuse shared UI primitives and CSS tokens.
6. Add behavioral and architectural tests.
7. Update the build manifest only if a new source module is required, then rebuild and check generated assets.

Do not add a file whose purpose is to fix, override, repair, or rebind another feature after it renders. Move the behavior into the module that owns it and delete the superseded implementation after the tests pass.
