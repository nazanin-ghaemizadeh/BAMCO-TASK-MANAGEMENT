const APP_ORIGIN = "https://nazanin-ghaemizadeh.github.io";
const BUCKET = "documents-private";
const MAX = 25 * 1024 * 1024;

const ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const ok = origin === APP_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : APP_ORIGIN,
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const serviceHeaders = (service: string) => ({
  apikey: service,
  Authorization: `Bearer ${service}`,
  "Content-Type": "application/json",
});

// Bound upstream stalls, including response-body reads, rather than keeping the
// UI waiting until the Edge runtime kills the request.
function boundedFetch(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(init.body instanceof File ? 45000 : 15000) });
}
function afterCommit(work: Promise<unknown>) {
  const handled = work.catch((error) => console.error("Document post-commit maintenance failed", error));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(handled);
}

async function parse(response: Response) {
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.error || data?.msg || `HTTP ${response.status}`);
  return data;
}

const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const cleanPath = (value: string) => value.split("/").filter(Boolean).map((part) => {
  try { return decodeURIComponent(part); } catch { return part; }
}).join("/");
const encodedPath = (value: string) => cleanPath(value).split("/").map(encodeURIComponent).join("/");

function fileMime(file: File) {
  const declared = String(file.type || "").toLowerCase();
  if (ALLOWED.has(declared)) return declared;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXT[ext] || declared;
}

function extension(file: File, mime = fileMime(file)) {
  return EXT_BY_MIME[mime] || file.name.split(".").pop()?.toLowerCase() || "bin";
}

function validateFile(file: File) {
  const mime = fileMime(file);
  if (!ALLOWED.has(mime)) throw Object.assign(new Error("فرمت فایل مجاز نیست."), { status: 400 });
  if (file.size <= 0 || file.size > MAX) throw Object.assign(new Error("حجم فایل باید حداکثر ۲۵ مگابایت باشد."), { status: 413 });
  return mime;
}

async function authManager(req: Request, url: string, anon: string, service: string) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization) throw Object.assign(new Error("ورود معتبر نیست."), { status: 401 });
  const userResponse = await boundedFetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
  if (!userResponse.ok) throw Object.assign(new Error("نشست کاربری معتبر نیست."), { status: 401 });
  const user = await userResponse.json();
  const rows = await parse(await boundedFetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,active`,
    { headers: serviceHeaders(service) },
  ));
  if (!rows?.[0]?.active || rows[0].role !== "manager") {
    throw Object.assign(new Error("فقط مدیر مجاز به مدیریت مستندات است."), { status: 403 });
  }
  return user;
}

async function audit(url: string, service: string, userId: string, action: string, targetId: string | null, metadata: Record<string, unknown> = {}) {
  await parse(await boundedFetch(`${url}/rest/v1/security_audit_log`, {
    method: "POST",
    headers: { ...serviceHeaders(service), Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, action, target_type: "document", target_id: targetId, metadata }),
  }));
}

async function category(url: string, service: string, id: number) {
  const rows = await parse(await boundedFetch(`${url}/rest/v1/document_categories?id=eq.${id}&select=id,title`, { headers: serviceHeaders(service) }));
  return rows?.[0] || null;
}

async function documentRow(url: string, service: string, id: number) {
  const rows = await parse(await boundedFetch(`${url}/rest/v1/documents?id=eq.${id}&select=*`, { headers: serviceHeaders(service) }));
  return rows?.[0] || null;
}

async function uploadObject(url: string, service: string, path: string, file: File, mime: string) {
  const response = await boundedFetch(`${url}/storage/v1/object/${BUCKET}/${encodedPath(path)}`, {
    method: "POST",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": mime || "application/octet-stream",
      "Cache-Control": "no-cache",
      "x-upsert": "false",
    },
    body: file,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || "آپلود فایل انجام نشد.");
  }
}

async function deleteObjects(url: string, service: string, paths: string[]) {
  if (!paths.length) return;
  const response = await boundedFetch(`${url}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: serviceHeaders(service),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || "حذف فایل از فضای ذخیره‌سازی انجام نشد.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "روش درخواست مجاز نیست." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const user = await authManager(req, url, anon, service);
    const form = await req.formData();
    const action = clean(form.get("action"), 64);

    if (action === "upload") {
      const categoryId = Number(form.get("category_id"));
      const title = clean(form.get("title"), 220);
      const description = clean(form.get("description"), 4000);
      const file = form.get("file");
      if (!Number.isInteger(categoryId) || !await category(url, service, categoryId)) return json(req, { error: "دسته‌بندی معتبر نیست." }, 400);
      if (!title) return json(req, { error: "عنوان فایل الزامی است." }, 400);
      if (!(file instanceof File)) return json(req, { error: "فایلی دریافت نشد." }, 400);
      const mime = validateFile(file);
      const path = `categories/${categoryId}/${crypto.randomUUID()}.${extension(file, mime)}`;
      await uploadObject(url, service, path, file, mime);
      try {
        const rows = await parse(await boundedFetch(`${url}/rest/v1/documents`, {
          method: "POST",
          headers: { ...serviceHeaders(service), Prefer: "return=representation" },
          body: JSON.stringify({
            category_id: categoryId,
            title,
            description: description || null,
            original_file_name: file.name.slice(0, 512),
            storage_path: path,
            mime_type: mime,
            file_size: file.size,
            version: 1,
            created_by: user.id,
          }),
        }));
        const doc = rows?.[0];
        if (!doc?.id) throw new Error("ثبت اطلاعات سند تأیید نشد.");
        afterCommit(audit(url, service, user.id, "document_upload", String(doc.id), { category_id: categoryId, mime_type: mime, file_size: file.size }));
        return json(req, { ok: true, document: doc });
      } catch (error) {
        if (!(error instanceof Error) || !["TimeoutError", "AbortError", "TypeError"].includes(error.name)) {
          await deleteObjects(url, service, [path]).catch(() => {});
        }
        throw error;
      }
    }

    if (action === "replace") {
      const id = Number(form.get("document_id"));
      const old = await documentRow(url, service, id);
      const file = form.get("file");
      if (!old) return json(req, { error: "سند پیدا نشد." }, 404);
      if (!(file instanceof File)) return json(req, { error: "فایل جدید دریافت نشد." }, 400);
      const mime = validateFile(file);
      const categoryId = Number(form.get("category_id") || old.category_id);
      if (!await category(url, service, categoryId)) return json(req, { error: "دسته‌بندی معتبر نیست." }, 400);
      const title = clean(form.get("title") || old.title, 220);
      const description = clean(form.get("description") ?? old.description, 4000);
      const path = `categories/${categoryId}/${crypto.randomUUID()}.${extension(file, mime)}`;
      await uploadObject(url, service, path, file, mime);
      const patch = {
        category_id: categoryId,
        title,
        description: description || null,
        original_file_name: file.name.slice(0, 512),
        storage_path: path,
        mime_type: mime,
        file_size: file.size,
        version: Number(old.version || 1) + 1,
      };
      try {
        const rows = await parse(await boundedFetch(`${url}/rest/v1/documents?id=eq.${id}`, {
          method: "PATCH",
          headers: { ...serviceHeaders(service), Prefer: "return=representation" },
          body: JSON.stringify(patch),
        }));
        if (!rows?.length) throw new Error("به‌روزرسانی اطلاعات سند انجام نشد.");
        // Metadata now points at the new object. Cleanup/audit failure must
        // never roll it back or remove the successfully committed file.
        afterCommit(Promise.allSettled([
          deleteObjects(url, service, [old.storage_path]),
          audit(url, service, user.id, "document_update", String(id), { operation: "replace", version: patch.version, mime_type: mime, file_size: file.size }),
        ]).then(results => { for (const result of results) if (result.status === "rejected") console.error("Document maintenance failed", result.reason); }));
        return json(req, { ok: true, document: rows[0] });
      } catch (error) {
        if (!(error instanceof Error) || !["TimeoutError", "AbortError", "TypeError"].includes(error.name)) {
          await deleteObjects(url, service, [path]).catch(() => {});
        }
        throw error;
      }
    }

    if (action === "update") {
      const id = Number(form.get("document_id"));
      const old = await documentRow(url, service, id);
      if (!old) return json(req, { error: "سند پیدا نشد." }, 404);
      const categoryId = Number(form.get("category_id") || old.category_id);
      if (!await category(url, service, categoryId)) return json(req, { error: "دسته‌بندی معتبر نیست." }, 400);
      const title = clean(form.get("title") || old.title, 220);
      if (!title) return json(req, { error: "عنوان فایل الزامی است." }, 400);
      const description = clean(form.get("description") ?? old.description, 4000);
      const rows = await parse(await boundedFetch(`${url}/rest/v1/documents?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...serviceHeaders(service), Prefer: "return=representation" },
        body: JSON.stringify({ category_id: categoryId, title, description: description || null }),
      }));
      await audit(url, service, user.id, "document_update", String(id), { operation: "metadata", category_id: categoryId });
      return json(req, { ok: true, document: rows?.[0] });
    }

    if (action === "delete") {
      const id = Number(form.get("document_id"));
      const old = await documentRow(url, service, id);
      if (!old) return json(req, { ok: true });
      await parse(await boundedFetch(`${url}/rest/v1/documents?id=eq.${id}`, {
        method: "DELETE",
        headers: { ...serviceHeaders(service), Prefer: "return=representation" },
      }));
      try {
        await deleteObjects(url, service, [old.storage_path]);
      } catch (error) {
        await boundedFetch(`${url}/rest/v1/documents`, {
          method: "POST",
          headers: { ...serviceHeaders(service), Prefer: "return=minimal" },
          body: JSON.stringify(old),
        }).catch(() => {});
        throw error;
      }
      await audit(url, service, user.id, "document_delete", String(id), { category_id: old.category_id, mime_type: old.mime_type, file_size: old.file_size });
      return json(req, { ok: true });
    }

    if (action === "delete_category") {
      const id = Number(form.get("category_id"));
      const cat = await category(url, service, id);
      if (!cat) return json(req, { ok: true });
      const docs = await parse(await boundedFetch(`${url}/rest/v1/documents?category_id=eq.${id}&select=storage_path,id`, { headers: serviceHeaders(service) }));
      const paths = docs.map((doc: any) => doc.storage_path).filter(Boolean);
      if (paths.length) await deleteObjects(url, service, paths);
      await parse(await boundedFetch(`${url}/rest/v1/document_categories?id=eq.${id}`, {
        method: "DELETE",
        headers: { ...serviceHeaders(service), Prefer: "return=minimal" },
      }));
      await parse(await boundedFetch(`${url}/rest/v1/security_audit_log`, {
        method: "POST",
        headers: { ...serviceHeaders(service), Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: user.id,
          action: "category_delete",
          target_type: "document_category",
          target_id: String(id),
          metadata: { title: cat.title, document_count: paths.length },
        }),
      }));
      return json(req, { ok: true, deleted_documents: paths.length });
    }

    return json(req, { error: "عملیات معتبر نیست." }, 400);
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "خطای ناشناخته در مدیریت مستندات." }, Number((error as any)?.status) || 500);
  }
});
