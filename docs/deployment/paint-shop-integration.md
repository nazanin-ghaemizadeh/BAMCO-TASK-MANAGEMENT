# Paint Shop in Task Management

`ovenAnalysis` is a standalone, permission-controlled route under **پایش حرارتی سالن رنگ**. The independent **کنترل آماری کیفیت** group contains `statisticalProcessControl`; its page explicitly says its tools have not yet been defined.

The oven route loads a local copy of the full Paint Shop app in a sandboxed iframe. No portal tokens, session storage or database credentials are sent into the iframe. File parsing and calculations remain in the browser. Excel import, baking windows, company selection, comparisons and individual/daily PDF exports use the original source files unchanged. The iframe permits scripts, forms, dialogs and downloads but has an opaque origin, isolating it from the portal's session. It is created only after the canonical access service grants view access and is destroyed on logout, account change or permission revocation. Navigating to another portal tab preserves the in-progress analysis until that session ends.

The original GitHub Pages site remains public and unchanged. This integration controls access to the portal route; it does not turn the public Paint Shop source or static files into private server-protected content.

## Source updates

The canonical source remains `nazanin-ghaemizadeh/BAMCO-PAINT-SHOP`. Do not edit `tools/paint-shop` by hand. Run:

```
node scripts/sync-paint-shop.mjs
```

Or use an existing clean checkout:

```
node scripts/sync-paint-shop.mjs --source /absolute/path/to/BAMCO-PAINT-SHOP
```

The script imports the tracked static app and assets without transformations and records the upstream commit plus SHA-256 checksums in `source.json`. Review and publish the resulting changes in Task Management. Synchronization is explicit, so an unrelated upstream deployment cannot silently change a running portal release. `tests/quality-tools.test.cjs` checks source integrity, independent categories, authorization, local loading and session cleanup.

The feature registration migration applies to `public`, `bamco_process` and `bamco_quality`. The existing manager access applies automatically; other accounts need an explicit grant from **دسترسی‌ها**. No business rows or files are copied between management departments.
