import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: "Invalid sign-in details" }, 400);
    const { username: input, password } = JSON.parse(raw);
    const username = typeof input === "string" ? input.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9 ._-]{2,63}$/.test(username) || typeof password !== "string" || !password || password.length > 1024)
      return reply({ error: "Invalid username or password" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(username));
    const attemptKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
    const limit = await admin.rpc("allow_username_login", { attempt_key: attemptKey });
    if (limit.error) throw limit.error;
    if (!limit.data) return reply({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    const lookup = await admin.from("login_usernames").select("user_id").eq("username", username).maybeSingle();
    if (lookup.error) throw lookup.error;
    const account = lookup.data ? await admin.auth.admin.getUserById(lookup.data.user_id) : null;
    if (account?.error) throw account.error;
    // Unknown usernames also go through Auth; never return the resolved email.
    const email = account?.data.user?.email ?? `${crypto.randomUUID()}@users.invalid`;
    const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await auth.auth.signInWithPassword({ email, password });
    if (!lookup.data || result.error || !result.data.session)
      return reply({ error: "Invalid username or password" }, 401);
    return reply({ access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token });
  } catch {
    return reply({ error: "Sign-in is temporarily unavailable. Please try again." }, 503);
  }
});
