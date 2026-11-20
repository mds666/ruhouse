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

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return json(405, { error: "只支持 POST。" });
  }
  if (!SERVICE_ROLE_KEY) {
    return json(500, {
      error: "Netlify 还没有配置 SUPABASE_SERVICE_ROLE_KEY，管理员暂时不能删除邮箱账号。"
    });
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

  const authorization = req.headers.get("authorization") || "";
  const userToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!userToken) {
    return json(401, { error: "登录状态已失效，请重新登录。" });
  }

  const serviceHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: "Bearer " + SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  };

  try {
    // Verify the caller's Supabase session.
    const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: {
        apikey: ANON_KEY,
        Authorization: "Bearer " + userToken
      }
    });
    if (!userResponse.ok) {
      return json(401, { error: "登录状态已失效，请重新登录。" });
    }
    const caller = await userResponse.json();
    if (!caller?.id) {
      return json(401, { error: "登录状态已失效，请重新登录。" });
    }

    // Only rows in rh_admins may delete accounts.
    const adminResponse = await fetch(
      SUPABASE_URL +
        "/rest/v1/rh_admins?select=user_id&user_id=eq." +
        encodeURIComponent(caller.id),
      { headers: serviceHeaders }
    );
    const adminRows = await readResponse(adminResponse);
    if (!adminResponse.ok || !Array.isArray(adminRows) || !adminRows.length) {
      return json(403, { error: "需要管理员权限。" });
    }

    // Find the target email. Admin API is paginated.
    let target = null;
    const perPage = 200;
    for (let page = 1; page <= 20; page += 1) {
      const listResponse = await fetch(
        SUPABASE_URL +
          "/auth/v1/admin/users?page=" +
          page +
          "&per_page=" +
          perPage,
        { headers: serviceHeaders }
      );
      if (!listResponse.ok) {
        const detail = await readResponse(listResponse);
        return json(502, {
          error: detail?.message || detail?.error_description || "读取邮箱账号失败。"
        });
      }
      const payload = await readResponse(listResponse);
      const users = Array.isArray(payload) ? payload : payload?.users || [];
      target = users.find(
        (item) => String(item?.email || "").toLowerCase() === email
      );
      if (target || users.length < perPage) break;
    }

    if (!target?.id) {
      return json(404, { error: "没有找到这个邮箱账号。" });
    }
    if (target.id === caller.id) {
      return json(403, { error: "不能删除当前登录的管理员账号。" });
    }

    const targetAdminResponse = await fetch(
      SUPABASE_URL +
        "/rest/v1/rh_admins?select=user_id&user_id=eq." +
        encodeURIComponent(target.id),
      { headers: serviceHeaders }
    );
    const targetAdminRows = await readResponse(targetAdminResponse);
    if (
      targetAdminResponse.ok &&
      Array.isArray(targetAdminRows) &&
      targetAdminRows.length
    ) {
      return json(403, { error: "不能通过这里删除管理员账号。" });
    }

    // Delete the Auth user. Posts and comments use ON DELETE SET NULL,
    // so published content stays; votes cascade and are recounted below.
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
    return json(500, { error: "删除失败，请稍后重试。" });
  }
}
