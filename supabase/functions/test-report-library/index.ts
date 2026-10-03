// STAGED: deploy only after the reviewed test-reports schema is activated.
// Every mutation is authorized with the caller's JWT before service access.
const APP_ORIGIN = "https://nazanin-ghaemizadeh.github.io";
const BUCKET = "test-reports-private";
const MAX = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", txt: "text/plain", csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const EXT_BY_MIME = Object.fromEntries(Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]));
const ACTION_PERMISSION: Record<string, string> = {
  create_year: "create", update_year: "edit", delete_year: "delete",
  upload: "create", update: "edit", delete: "delete",
};
class ApiError extends Error {
  status: number; code: string; details: Record<string, unknown>;
  constructor(message: string, status = 500, code = "operation_failed", details: Record<string, unknown> = {}) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === APP_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return { "Access-Control-Allow-Origin": allowed ? origin : APP_ORIGIN,
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS", Vary: "Origin" };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function value(form: FormData, name: string, max: number, required = false) {
  const raw = form.get(name);
  if (raw != null && typeof raw !== "string") throw new ApiError("اطلاعات درخواست معتبر نیست.", 400, "invalid_field");
  const text = String(raw ?? "").trim();
  if ((required && !text) || text.length > max) throw new ApiError("اطلاعات درخواست کامل یا معتبر نیست.", 400, "invalid_field");
  return text;
}
function id(form: FormData, name: string) {
  const result = value(form, name, 36, true).toLowerCase();
  if (!UUID.test(result)) throw new ApiError("شناسه معتبر نیست.", 400, "invalid_id");
  return result;
}
function yearNumber(form: FormData) {
  const raw = value(form, "jalali_year", 4, true);
  const n = Number(raw);
  if (!/^\d{4}$/.test(raw) || !Number.isInteger(n) || n < 1200 || n > 1600) throw new ApiError("سال شمسی باید بین ۱۲۰۰ و ۱۶۰۰ باشد.", 400, "invalid_year");
  return n;
}
async function sha256(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2, "0")).join("");
}
async function parsed(response: Response) {
  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const code = String(data?.code || data?.error || "upstream_error");
    if (code === "23505") throw new ApiError("این پوشه یا شناسه قبلاً ثبت شده است.", 409, "already_exists");
    if (code === "23503") throw new ApiError("پوشه حذف شده یا هنوز دارای فایل است.", 409, "folder_conflict");
    throw new ApiError("عملیات تأیید نشد؛ دوباره تلاش کنید.", response.status >= 500 ? 503 : 500, code);
  }
  return data;
}
function context(url: string, anon: string, service: string, authorization: string) {
  // A request can never start a new Storage operation after the 90 s budget.
  // The server-side lease lasts 180 s, longer than this entire request budget.
  const deadline = AbortSignal.timeout(90000);
  const call = (path: string, init: RequestInit = {}) => fetch(`${url}${path}`, {
    ...init, signal: AbortSignal.any([deadline, AbortSignal.timeout(init.body instanceof File ? 45000 : 15000)]),
  });
  const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const userHeaders = { apikey: anon, Authorization: authorization, "Content-Type": "application/json" };
  return { call, serviceHeaders, userHeaders,
    rest: async (path: string, init: RequestInit = {}) => parsed(await call(`/rest/v1/${path}`, { ...init, headers: { ...serviceHeaders, Prefer: "return=representation", ...init.headers } })),
    rpc: async (name: string, body: unknown) => parsed(await call(`/rest/v1/rpc/${name}`, { method: "POST", headers: serviceHeaders, body: JSON.stringify(body) })),
  };
}
type Context = ReturnType<typeof context>;
async function row(ctx: Context, table: string, rowId: string) {
  const rows = await ctx.rest(`${table}?id=eq.${rowId}&select=*`);
  return rows?.[0] ?? null;
}
async function lease(ctx: Context, fileId: string, action: string) {
  const token = crypto.randomUUID();
  const result = await ctx.rpc("test_report_claim_operation", { p_id: fileId, p_token: token, p_action: action });
  if (result?.deleted) {
    if (action === "delete") return null;
    throw new ApiError("این شناسه قبلاً حذف شده است؛ بارگذاری جدید را آغاز کنید.", 409, "deleted_id");
  }
  if (!result?.claimed) throw new ApiError("عملیات قبلی هنوز در حال بررسی است؛ کمی بعد دوباره تلاش کنید.", 409, "operation_busy", { retry_after: result?.retry_after || 180 });
  return token;
}
async function release(ctx: Context, fileId: string, token: string) {
  // A failed unlock must not turn a committed result into an apparent failure.
  await ctx.rpc("test_report_release_operation", { p_id: fileId, p_token: token }).catch(() => {});
}
function sameUpload(existing: any, expected: any) {
  return ["id", "year_id", "created_by", "title", "description", "original_file_name", "storage_path", "mime_type", "file_size", "sha256"]
    .every(key => (existing[key] ?? null) === (expected[key] ?? null));
}
async function store(ctx: Context, path: string, file: File, mime: string, hash: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await ctx.call(`/storage/v1/object/${BUCKET}/${encoded}`, {
    method: "POST", headers: { ...ctx.serviceHeaders, "Content-Type": mime, "x-upsert": "false", "Cache-Control": "no-cache" }, body: file,
  });
  if (response.ok) { await response.arrayBuffer(); return; }
  const error = await response.json().catch(() => ({}));
  const duplicate = [400, 409].includes(response.status) && /duplicate|already exists/i.test(`${error.error || ""} ${error.message || ""} ${error.code || ""}`);
  if (!duplicate) throw new ApiError("بارگذاری تأیید نشد؛ فایل در حالت انتظار باقی ماند. دوباره تلاش کنید.", 503, "upload_unconfirmed");
  // An earlier attempt may have stored the bytes before its reply was lost.
  // Never overwrite: verify those bytes against the server-computed digest.
  const existing = await ctx.call(`/storage/v1/object/authenticated/${BUCKET}/${encoded}`, { headers: ctx.serviceHeaders });
  if (!existing.ok) throw new ApiError("تأیید فایل قبلی انجام نشد؛ دوباره تلاش کنید.", 503, "upload_unconfirmed");
  const bytes = await existing.arrayBuffer();
  if (bytes.byteLength !== file.size || await sha256(bytes) !== hash) throw new ApiError("محتوای فایل با درخواست قبلی یکسان نیست.", 409, "object_conflict");
}
async function handleYear(ctx: Context, action: string, form: FormData, userId: string) {
  if (action === "create_year") {
    const yearId = id(form, "id"), domain = value(form, "domain", 20, true), reportType = value(form, "report_type", 30, true), jalaliYear = yearNumber(form);
    if (!["environment", "standard"].includes(domain) || !["research", "production", "type_engineering"].includes(reportType)) throw new ApiError("گروه گزارش معتبر نیست.", 400, "invalid_group");
    const wanted = { id: yearId, domain, report_type: reportType, jalali_year: jalaliYear, created_by: userId };
    const existing = await row(ctx, "test_report_years", yearId);
    if (existing) {
      if (!Object.keys(wanted).every(key => existing[key] === wanted[key as keyof typeof wanted])) throw new ApiError("شناسه پوشه با درخواست قبلی یکسان نیست.", 409, "idempotency_conflict");
      return { ok: true, year: existing };
    }
    try {
      const rows = await ctx.rest("test_report_years", { method: "POST", body: JSON.stringify(wanted) });
      if (!rows?.[0]) throw new ApiError("ثبت پوشه تأیید نشد.", 503);
      return { ok: true, year: rows[0] };
    } catch (error) {
      // Concurrent identical create requests may both pass the initial read.
      if (error instanceof ApiError && error.code === "already_exists") {
        const committed = await row(ctx, "test_report_years", yearId);
        if (committed && Object.keys(wanted).every(key => committed[key] === wanted[key as keyof typeof wanted])) return { ok: true, year: committed };
      }
      throw error;
    }
  }
  const yearId = id(form, "year_id");
  if (action === "update_year") {
    const rows = await ctx.rest(`test_report_years?id=eq.${yearId}`, { method: "PATCH", body: JSON.stringify({ jalali_year: yearNumber(form) }) });
    if (!rows?.[0]) throw new ApiError("پوشه پیدا نشد.", 404, "not_found");
    return { ok: true, year: rows[0] };
  }
  const response = await ctx.call(`/rest/v1/test_report_files?year_id=eq.${yearId}&select=id&limit=1`, { headers: { ...ctx.serviceHeaders, Prefer: "count=exact" } });
  const files = await parsed(response);
  if (files?.length) {
    const count = Number(response.headers.get("content-range")?.split("/")[1]);
    throw new ApiError("ابتدا فایل‌های داخل این پوشه را حذف کنید.", 409, "folder_not_empty", { count: Number.isFinite(count) && count > 0 ? count : files.length });
  }
  // FK RESTRICT also closes the race with an upload reserving a new row.
  try { await ctx.rest(`test_report_years?id=eq.${yearId}`, { method: "DELETE" }); }
  catch (error) {
    if (error instanceof ApiError && error.code === "folder_conflict") {
      const latest = await ctx.call(`/rest/v1/test_report_files?year_id=eq.${yearId}&select=id&limit=1`, { headers: { ...ctx.serviceHeaders, Prefer: "count=exact" } });
      const rows = await parsed(latest);
      const count = Number(latest.headers.get("content-range")?.split("/")[1]);
      throw new ApiError("ابتدا فایل‌های داخل این پوشه را حذف کنید.", 409, "folder_not_empty", { count: Number.isFinite(count) && count > 0 ? count : rows?.length || 1 });
    }
    throw error;
  }
  return { ok: true };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "روش درخواست مجاز نیست.", code: "method_not_allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) throw new ApiError("ورود معتبر نیست.", 401, "unauthorized");
    if (Number(req.headers.get("content-length") || 0) > MAX + 65536) throw new ApiError("حجم درخواست بیش از حد مجاز است.", 413, "file_too_large");
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) throw new ApiError("سرویس گزارش‌ها پیکربندی نشده است.", 503, "not_configured");
    const ctx = context(url, anon, service, authorization);
    const auth = await ctx.call("/auth/v1/user", { headers: ctx.userHeaders });
    if (!auth.ok) throw new ApiError("نشست کاربری معتبر نیست.", 401, "unauthorized");
    const user = await auth.json();
    if (!UUID.test(user?.id || "")) throw new ApiError("نشست کاربری معتبر نیست.", 401, "unauthorized");
    let form: FormData;
    try { form = await req.formData(); } catch { throw new ApiError("اطلاعات درخواست معتبر نیست.", 400, "invalid_form"); }
    const action = value(form, "action", 32, true), permission = ACTION_PERMISSION[action];
    if (!permission) throw new ApiError("عملیات معتبر نیست.", 400, "invalid_action");
    const allowed = await parsed(await ctx.call("/rest/v1/rpc/can_access_feature", {
      method: "POST", headers: ctx.userHeaders, body: JSON.stringify({ p_feature_key: "documents", p_action: permission }),
    }));
    if (allowed !== true) throw new ApiError("مجوز این عملیات را ندارید.", 403, "forbidden");
    if (action.endsWith("_year")) return json(req, await handleYear(ctx, action, form, user.id));
    if (action === "upload") {
      const fileId = id(form, "id"), yearId = id(form, "year_id"), title = value(form, "title", 220, true), description = value(form, "description", 4000) || null;
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError("فایلی دریافت نشد.", 400, "missing_file");
      if (file.size <= 0 || file.size > MAX) throw new ApiError("حجم فایل باید حداکثر ۲۵ مگابایت باشد.", 413, "file_too_large");
      if (!file.name || file.name.length > 512) throw new ApiError("نام فایل معتبر نیست.", 400, "invalid_file_name");
      const ext = file.name.split(".").pop()?.toLowerCase() || "", declared = file.type.toLowerCase();
      const mime = EXT_BY_MIME[declared] ? declared : MIME_BY_EXT[ext];
      if (!mime) throw new ApiError("فرمت فایل مجاز نیست.", 400, "invalid_file_type");
      const hash = await sha256(await file.arrayBuffer());
      const wanted = { id: fileId, year_id: yearId, title, description, original_file_name: file.name,
        storage_path: `years/${yearId}/${fileId}.${EXT_BY_MIME[mime]}`, mime_type: mime, file_size: file.size, sha256: hash, created_by: user.id };
      const token = await lease(ctx, fileId, action);
      // Upload cannot receive a null lease; tombstoned IDs are rejected above.
      if (!token) throw new ApiError("شناسه فایل معتبر نیست.", 409, "deleted_id");
      let mutationStarted = false;
      try {
        let existing = await row(ctx, "test_report_files", fileId);
        if (existing && !sameUpload(existing, wanted)) throw new ApiError("این شناسه برای فایل یا اطلاعات دیگری استفاده شده است.", 409, "idempotency_conflict");
        if (existing?.status === "deleting") throw new ApiError("فایل در حال حذف است.", 409, "file_deleting");
        if (existing?.status === "ready") { await release(ctx, fileId, token); return json(req, { ok: true, file: existing }); }
        if (!existing) {
          if (!await row(ctx, "test_report_years", yearId)) throw new ApiError("پوشه پیدا نشد.", 404, "not_found");
          mutationStarted = true;
          const rows = await ctx.rest("test_report_files", { method: "POST", body: JSON.stringify({ ...wanted, status: "pending" }) });
          existing = rows?.[0];
          if (!existing) throw new ApiError("رزرو بارگذاری تأیید نشد.", 503, "upload_unconfirmed");
        }
        mutationStarted = true;
        await store(ctx, existing.storage_path, file, mime, hash);
        const ready = await ctx.rpc("test_report_finish_upload", { p_id: fileId, p_token: token });
        if (!ready?.id) throw new ApiError("نهایی‌سازی بارگذاری تأیید نشد؛ دوباره تلاش کنید.", 503, "upload_unconfirmed");
        return json(req, { ok: true, file: ready });
      } catch (error) {
        // No compensation deletes on any failure. Ambiguous writes retain both
        // reservation and lease so a reload/retry reconciles the same operation.
        if (!mutationStarted) await release(ctx, fileId, token);
        throw error;
      }
    }
    const fileId = id(form, "file_id"), token = await lease(ctx, fileId, action);
    if (!token) return json(req, { ok: true }); // Previously completed delete.
    let mutationStarted = false;
    try {
      const existing = await row(ctx, "test_report_files", fileId);
      if (!existing) {
        await release(ctx, fileId, token);
        if (action === "delete") return json(req, { ok: true });
        throw new ApiError("فایل پیدا نشد.", 404, "not_found");
      }
      if (action === "update") {
        if (existing.status !== "ready") throw new ApiError("ابتدا بارگذاری یا حذف قبلی را تکمیل کنید.", 409, "file_not_ready");
        const patch = { title: value(form, "title", 220, true), description: value(form, "description", 4000) || null };
        mutationStarted = true;
        const rows = await ctx.rest(`test_report_files?id=eq.${fileId}&status=eq.ready`, { method: "PATCH", body: JSON.stringify(patch) });
        if (!rows?.[0]) throw new ApiError("ویرایش تأیید نشد.", 503);
        await release(ctx, fileId, token);
        return json(req, { ok: true, file: rows[0] });
      }
      mutationStarted = true;
      if (existing.status !== "deleting") {
        const rows = await ctx.rest(`test_report_files?id=eq.${fileId}`, { method: "PATCH", body: JSON.stringify({ status: "deleting" }) });
        if (!rows?.[0]) throw new ApiError("آغاز حذف تأیید نشد.", 503);
      }
      // Delete is retriable: an absent object is already the desired outcome.
      const removed = await ctx.call(`/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: ctx.serviceHeaders, body: JSON.stringify({ prefixes: [existing.storage_path] }) });
      if (removed.status !== 404) await parsed(removed);
      // SQL removes metadata last and records a tombstone in one transaction.
      const result = await ctx.rpc("test_report_finish_delete", { p_id: fileId, p_token: token });
      if (result !== true) throw new ApiError("نهایی‌سازی حذف تأیید نشد؛ دوباره تلاش کنید.", 503, "delete_unconfirmed");
      return json(req, { ok: true });
    } catch (error) {
      if (!mutationStarted) await release(ctx, fileId, token);
      throw error;
    }
  } catch (error) {
    const known = error instanceof ApiError;
    return json(req, { ok: false, error: known ? error.message : "نتیجه عملیات تأیید نشد؛ کمی بعد با همان اطلاعات دوباره تلاش کنید.",
      code: known ? error.code : "operation_unconfirmed", ...(known ? error.details : {}),
    }, known ? error.status : 503);
  }
});
