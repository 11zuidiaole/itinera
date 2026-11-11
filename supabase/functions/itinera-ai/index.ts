// itinera-ai：把粘贴的文字 / 截图交给 Claude 整理成日程
// 需要的 Secrets：ANTHROPIC_API_KEY（必填），ALLOWED_EMAILS（可选，逗号分隔，只允许这些邮箱使用）
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "请先登录" }, 401);
    const allow = (Deno.env.get("ALLOWED_EMAILS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allow.length && !allow.includes((user.email || "").toLowerCase())) return json({ error: "这个账号没有使用权限" }, 403);

    const { prompt, images } = await req.json();
    if (typeof prompt !== "string" || prompt.length > 40000) return json({ error: "内容太长了" }, 400);
    const imgs = Array.isArray(images) ? images.slice(0, 8) : [];
    const content = [
      ...imgs
        .filter((i) => i && typeof i.data === "string" && /^image\/(jpeg|png|webp|gif)$/.test(i.type))
        .map((i) => ({ type: "image", source: { type: "base64", media_type: i.type, data: i.data } })),
      { type: "text", text: prompt },
    ];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 4000, messages: [{ role: "user", content }] }),
    });
    const j = await r.json();
    if (!r.ok) return json({ error: j?.error?.message || "AI 请求失败" }, 502);
    const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    return json({ text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
