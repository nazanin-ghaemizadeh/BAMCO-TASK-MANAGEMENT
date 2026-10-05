# Home navigation option parity

## Scope

Cards, circular launcher and custom circular layout expose the same authorized destinations. The phonebook card now contains Office (اداری), Factory (کارخانه), and Outside the organization (خارج از سازمان), matching the circular launcher and opening the selected category.

The original navigation buttons remain the source of access and route authority. Expanded phonebook shortcuts have `data-route`, never a second `data-view` route. Both shortcut presentations use the same option derivation and activation handler. Other card routes retain their native handlers.

No backend policy, grant, account, business record, or protected operation changes are included.

## Safety and lifecycle

- Permission, original source presence/visibility, account/session generation, group visibility, active home view and home navigation epoch are rechecked across the queued click boundary
- Revoked, inactive, signed-out, detached, or replaced controls cannot invoke a stale section action
- Repeated access/layout refreshes preserve the three shortcut identities without duplicates
- Background badge refreshes preserve keyboard focus; changed option sets restore focus to the same surviving option or first available option
- Existing mobile geometry, centered labels and pointer/keyboard focus treatment are preserved

## Verification

- The supplied phone screenshot was inspected to verify the mismatch and intended card presentation
- Existing 12 home layout/launcher tests passed locally
- New `tests/home-option-parity.test.cjs` covers category parity, actual category activation, source handlers, stale/queued activation and access changes
- `tests/browser/check_home_responsive.py` now measures effective card shortcuts and taps all three phonebook categories in cards/launcher/custom
- Independent JS/CSS review passed
- Source syntax, reproducible bundle generation and whitespace checks passed
- Full regression and real Chromium/WebKit responsive/visual CI must pass on the published head before merging. Local browser initialization was blocked by the cloud runtime's Unix-socket restriction; local browser success is not claimed

All application/browser fixtures are synthetic, external network is blocked, and no production data is used for acceptance testing.
