# Invoice amount and authorized-tab visibility audit

## Scope

Display-only invoice formatting and consistency between existing effective permissions, navigation, parent groups, and route guards. No grants, roles, RLS policies, production records, file-slot rules, or financial imports are changed.

The application's actual navigation has 37 entries: 36 grantable tabs plus access administration. Its catalog additionally retains three internal aliases (`templates`, `alertSettings`, `emailSettings`) that have no home entry. Four legacy server keys (`responseTracking`, `responseReport`, `requestReport`, `loginReport`) have no current catalog route. Shared tab permissions remain shared: the two letters tabs use `letters`; test reports use `documents`.

## Findings and corrections

- Invoice readouts preserved a database `.00` scale. An opt-in string formatter now omits only an all-zero fraction. Nonzero fractions, large amounts, saved values, and other modules' default formatting remain unchanged.
- Older concurrent access responses could overwrite newer grants or revocations. Refreshes now use latest-request ordering; initial waiters join the newest still-pending result.
- A normal access-token rotation caused a valid permission response to be discarded. Access snapshots now follow the authentication session generation, with explicit account/session guards and inactive-account denial.
- Organization changes and browser resume could leave an open portal's navigation stale. Existing organization/profile events and foreground/pageshow/online recovery now reload the authoritative snapshot without polling.
- Access administration had conflicting `people.view`, `settings.view`, and `settings.manage_access` checks. Its source button, parent group, renderer and direct route now consistently use the existing `settings.manage_access` authority. An ordinary view grant cannot expose the administration tab.

## Verification matrix

- Exact-string money tests: zero totals, large integer amounts, real fractional values, Persian digit grouping, card/detail/payment-stage readouts, editable values, and unchanged save payloads
- Access runtime tests: out-of-order success/failure, initial refresh superseded by invalidation, token rotation, logout/re-login, account switch, inactive accounts, malformed responses, recovery, organizational/profile changes and browser resume
- DOM integration: independent inventory of 40 catalog routes, 37 actual nav entries and 12 parent groups; every single view-only grant; all 36 grantable tabs through source-button clicks and direct navigation; denials; open-launcher refresh; management-only administration
- Real Chromium suite: desktop 1365px and mobile 390px, launcher/cards layouts, manager and owner, actual computed CSS and route clicks, grant/revoke recovery and management-only administration. The existing read-only browser workflow runs it on every PR

## Commands

```
npm run build:assets
npm run check:assets
npm run test:regression
node --test --test-force-exit tests/access-refresh-races.test.cjs tests/access-visibility-matrix.test.cjs tests/invoice-money-display.test.cjs tests/money-input.test.cjs
python tests/browser/check_access_visibility.py --width 1365 --output test-results/access-visibility/desktop.json
python tests/browser/check_access_visibility.py --width 390 --output test-results/access-visibility/mobile.json
```

Optional synthetic scenario files are supported by `BAMCO_ACCESS_SCENARIO_FILE` for the DOM suite and `--scenario-file` for Chromium.

Local Chromium launch was blocked by the executor's socket restrictions, so real CSS/browser acceptance must be established by the read-only CI run before release. CI uses isolated in-memory APIs and never signs in to or writes production.

## Verified real-browser acceptance

The read-only CI run [37196118737](https://github.com/nazanin-ghaemizadeh/BAMCO-TASK-MANAGEMENT/actions/runs/37196118737) passed both access-visibility jobs on implementation commit `b7327c1961efc7ad15285a98ab128c7aa1e06425`: eight desktop/mobile, launcher/cards, owner/manager cases; 292 real route clicks; zero visibility failures or browser errors. The same shipped bundle is retained by the follow-up assertion/documentation-only commit.
