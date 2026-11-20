const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://qmfqncpoqpdofskolqix.supabase.co";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_magsMihtXvWqaDP3Gk_eDg_XJ7yv2rE";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}

async function listAllUsers(serviceHeaders) {
  const users = [];
  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(
      SUPABASE_URL +
        "/auth/v1/admin/users?page=" +
        page +
        "&per_page=" +
        perPage,
      { headers: serviceHeaders }
    );
    if (!response.ok) {
      const detail = await readResponse(response);
      throw new Error(
        detail?.message || detail?.error_description || "读取邮箱账号失败。"
      );
    }
    const payload = await readResponse(response);
    const rows = Array.isArray(payload) ? payload : payload?.users || [];
    users.push(...rows);
    if (rows.length < perPage) break;
  }
  return users;
}

async function callerAndAdmins(req, serviceHeaders) {
  const authorization = req.headers.get("authorization") || "";
  const userToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!userToken) {
    return { error: json(401, { error: "登录状态已失效，请重新登录。" }) };
  }

  const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      apikey: ANON_KEY,
      Authorization: "Bearer " + userToken
    }
  });
  if (!userResponse.ok) {
    return { error: json(401, { error: "登录状态已失效，请重新登录。" }) };
  }
  const caller = await userResponse.json();
  if (!caller?.id) {
    return { error: json(401, { error: "登录状态已失效，请重新登录。" }) };
  }

  const adminResponse = await fetch(
    SUPABASE_URL +
      "/rest/v1/rh_admins?select=user_id&user_id=eq." +
      encodeURIComponent(caller.id),
    { headers: serviceHeaders }
  );
  const adminRows = await readResponse(adminResponse);
  if (!adminResponse.ok || !Array.isArray(adminRows) || !adminRows.length) {
    return { error: json(403, { error: "需要管理员权限。" }) };
  }

  const allAdminsResponse = await fetch(
    SUPABASE_URL + "/rest/v1/rh_admins?select=user_id",
    { headers: serviceHeaders }
  );
  const allAdmins = await readResponse(allAdminsResponse);
  const adminIds = new Set(
    Array.isArray(allAdmins) ? allAdmins.map((row) => row.user_id) : []
  );

  return { caller, adminIds };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "只支持 GET 或 POST。" });
  }
  if (!SERVICE_ROLE_KEY) {
    return json(500, {
      error: "Netlify 还没有配置 SUPABASE_SERVICE_ROLE_KEY，管理员暂时不能管理邮箱账号。"
    });
  }

  const serviceHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: "Bearer " + SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  };

  try {
    const auth = await callerAndAdmins(req, serviceHeaders);
    if (auth.error) return auth.error;
    const { caller, adminIds } = auth;

    if (req.method === "GET") {
      const users = await listAllUsers(serviceHeaders);
      const rows = users
        .filter((user) => user?.email)
        .map((user) => ({
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          email_confirmed_at: user.email_confirmed_at,
          is_admin: adminIds.has(user.id),
          is_self: user.id === caller.id
        }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return json(200, { users: rows, total: rows.length });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "请求格式不正确。" });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return json(400, { error: "请输入有效邮箱。" });
    }

    const users = await listAllUsers(serviceHeaders);
    const target = users.find(
      (item) => String(item?.email || "").toLowerCase() === email
    );
    if (!target?.id) {
      return json(404, { error: "没有找到这个邮箱账号。" });
    }
    if (target.id === caller.id) {
      return json(403, { error: "不能删除当前登录的管理员账号。" });
    }
    if (adminIds.has(target.id)) {
      return json(403, { error: "不能通过这里删除管理员账号。" });
    }

    const deleteResponse = await fetch(
      SUPABASE_URL + "/auth/v1/admin/users/" + encodeURIComponent(target.id),
      { method: "DELETE", headers: serviceHeaders }
    );
    if (!deleteResponse.ok) {
      const detail = await readResponse(deleteResponse);
      return json(502, {
        error: detail?.message || detail?.error_description || "删除邮箱账号失败。"
      });
    }

    let warning = "";
    const recountResponse = await fetch(
      SUPABASE_URL + "/rest/v1/rpc/rh_recount_post_stats",
      {
        method: "POST",
        headers: serviceHeaders,
        body: "{}"
      }
    );
    if (!recountResponse.ok) {
      warning = "账号已删除，帖子已保留；但点赞/评论计数刷新失败，请重新运行 schema.sql。";
    }

    return json(200, {
      deleted: true,
      email: target.email || email,
      userId: target.id,
      postsPreserved: true,
      warning
    });
  } catch (error) {
    console.error("admin-delete-user failed:", error?.message || error);
    return json(500, { error: error?.message || "操作失败，请稍后重试。" });
  }
}
