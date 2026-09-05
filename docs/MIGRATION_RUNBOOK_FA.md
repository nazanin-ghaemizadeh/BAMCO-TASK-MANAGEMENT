# Runbook مهاجرت BAMCO

## Gate صفر: مجوز اجرا

این بسته در Production اجرا نشده است. ابتدا باید Snapshot واقعی Supabase و ساختار فعلی جداول دریافت شود؛ سپس Migration تطبیقی از روی Diff ساخته شود. اجرای مستقیم Baseline هدف روی دیتابیس موجود ممنوع است.

## پشتیبان‌های لازم

- Git mirror و SHA شاخه `main`
- `pg_dump` شامل Schema، Data، Policies، Functions و Grants
- فهرست کاربران Auth و Metadata آن‌ها
- Export کامل Storage Bucketها
- فایل Excel مرجع و SHA-256 آن
- Export تنظیمات Edge Functions و نام Secretها، بدون قرار دادن مقدار Secret در فایل

## کنترل‌های قبل از Migration

- شمارش `profiles`, `tasks`, `change_requests`, `email_logs`
- بیشترین شناسه قدیمی Task
- تعداد کانبان/آرشیو برای هر متولی
- ردیف‌های بدون مالک، ایمیل تکراری، تاریخ نامعتبر و Legacy ID تکراری
- فهرست Policyها و `security definer` Functionها

## آزمون RLS اجباری

1. Owner A فقط Task و Request خودش را می‌بیند.
2. Owner A با REST مستقیم نمی‌تواند Task خود یا دیگری را Update کند.
3. Owner A نمی‌تواند `owner_id` پیشنهادی را به فرد دیگری تغییر دهد.
4. Manager همه Taskها را می‌بیند و می‌نویسد.
5. Auditor همه داده عملیاتی را می‌بیند و هیچ Write ندارد.
6. تغییر Role از Client برای همه نقش‌ها رد می‌شود.
7. Graph connection و Secret reference از Client قابل خواندن نیست.

## آزمون تطبیق داده

| کنترل | انتظار |
|---|---|
| تعداد کل کانبان | برابر Excel مرجع |
| تعداد کل آرشیو | برابر Excel مرجع |
| تعداد هر متولی | برابر مرجع |
| بیشترین Legacy ID | برابر یا بزرگ‌تر از مرجع و بدون تکرار |
| تاخیر/تعجیل | برابر محاسبه روزمحور مرجع |
| ردیف ردشده | صفر یا دارای گزارش و تصمیم صریح مدیر |

## Rollback هر مرحله

- خواندن: Feature Flag به Bridge برگردد.
- ارسال: Provider به Bridge برگردد؛ Batch نیمه‌کاره با Idempotency Key دوباره ارسال نشود.
- Schema: Rollback با Drop انجام نشود؛ Migration اصلاحی Forward نوشته شود.
- داده: Import Job و Hash ردیف‌ها مبنای حذف کنترل‌شده همان Batch در Staging باشد؛ Production فقط پس از Dry Run.

## Definition of Done

- Backupها Restore-test شده‌اند.
- RLS با چهار نقش تست شده است.
- گزارش تطبیق داده بدون اختلاف حل‌نشده است.
- Graph Pilot ارسال، ثبت ID، Reply detection و Follow-up در همان رشته را پاس کرده است.
- Feature Flags و مسیر بازگشت مستند و آزمایش شده‌اند.
- هیچ قابلیت فعلی بدون تصمیم و تأیید صریح حذف نشده است.
