# Shared Paint Shop module

`ovenAnalysis` belongs to **پایش حرارتی سالن رنگ**. The independent **کنترل آماری کیفیت** group contains `statisticalProcessControl`; its page explicitly says its tools have not yet been defined.

The oven route embeds the live canonical application:

```
https://nazanin-ghaemizadeh.github.io/BAMCO-PAINT-SHOP/
```

There is one implementation, deployed from `nazanin-ghaemizadeh/BAMCO-PAINT-SHOP`. All future changes to oven calculations, layout, baking windows, comparisons, import and exports must be implemented and published in that repository, even when the request originates from Task Management. The standalone site and the Task Management module then load the same release. No copy, synchronization script, cross-repository token or second deployment is required. Portal categories, authorization and the surrounding toolbar remain owned by Task Management.

An already open analysis is preserved to avoid discarding uploaded files. Reload the page to load a newly published Paint Shop release; live updates do not replace an in-progress analysis. GitHub Pages publication and normal browser caching still apply equally to both entry points.

The old `tools/paint-shop/index.html` is only a compatibility redirect to the canonical site. The duplicated source, image assets, source checksum manifest and manual synchronization script were removed.

The portal CSP explicitly allows this canonical frame URL, including previews served from another origin. Other script and frame restrictions remain in force.

The iframe permits scripts, forms, dialogs and downloads while retaining an opaque origin. No portal token or account storage is passed into it. It is created only after the canonical access service grants view access, and removed on logout, account change or permission revocation. The public Paint Shop link continues working independently. This controls access to the portal route; it does not make the public standalone site private.

Feature registrations and admin access settings remain in `public`, `bamco_process` and `bamco_quality`. Existing administrators manage each feature separately from **دسترسی‌ها**; regular users need explicit grants. No database or Storage policy changes are needed for the shared module.
