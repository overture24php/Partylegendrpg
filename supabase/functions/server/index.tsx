import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check
app.get("/make-server-516bfa70/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Helper: Supabase admin client ───────────────────────────────────────────
function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─── Helper: get authenticated user ID from token ────────────────────────────
async function getAuthUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      console.warn("[Auth] Token expired");
      return null;
    }
    return payload.sub ?? null;
  } catch (err) {
    console.error("[Auth] JWT decode failed:", err);
    return null;
  }
}

// ─── POST /auth/signup ────────────────────────────────────────────────────────
app.post("/make-server-516bfa70/auth/signup", async (c) => {
  try {
    const { email, password, username } = await c.req.json();

    if (!email || !password || !username) {
      return c.json({ error: "Email, password, dan nama hero wajib diisi." }, 400);
    }
    if (username.length < 3) {
      return c.json({ error: "Nama hero minimal 3 karakter." }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: "Password minimal 6 karakter." }, 400);
    }

    const supabase = getAdminClient();

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { username },
      email_confirm: true,
    });

    if (authError) {
      console.log("Signup auth error:", authError);
      if (
        authError.message?.toLowerCase().includes("already registered") ||
        authError.message?.toLowerCase().includes("already exists")
      ) {
        return c.json({ error: "Email sudah terdaftar. Silakan login." }, 409);
      }
      return c.json({ error: `Gagal membuat akun: ${authError.message}` }, 400);
    }

    const userId = authData.user.id;

    const profile = {
      id: userId,
      email,
      username,
      level: 1,
      xp: 0,
      maxXp: 100,
      gold: 500,
      gems: 30,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`profile:${userId}`, profile);
    return c.json({ success: true, profile });
  } catch (err) {
    console.log("Signup unexpected error:", err);
    return c.json({ error: `Server error saat signup: ${err}` }, 500);
  }
});

// ─── POST /auth/lookup-username ───────────────────────────────────────────────
app.post("/make-server-516bfa70/auth/lookup-username", async (c) => {
  try {
    const { username } = await c.req.json();
    if (!username) return c.json({ error: "Username wajib diisi." }, 400);

    const profiles = await kv.getByPrefix("profile:");
    const match = profiles.find((p: any) => p?.username === username);
    if (!match) return c.json({ error: "Username tidak ditemukan." }, 404);

    return c.json({ email: (match as any).email });
  } catch (err) {
    console.log("Lookup username error:", err);
    return c.json({ error: `Server error: ${err}` }, 500);
  }
});

// ─── GET /profile ─────────────────────────────────────────────────────────────
app.get("/make-server-516bfa70/profile", async (c) => {
  try {
    const authHeader = c.req.header("Authorization") ?? null;
    const userId = await getAuthUserId(authHeader);
    if (!userId) {
      return c.json({ error: "Unauthorized: token tidak valid." }, 401);
    }

    let profile = await kv.get(`profile:${userId}`);

    if (!profile) {
      const supabase = getAdminClient();
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const authUser = userData?.user;

      const username =
        authUser?.user_metadata?.username ||
        authUser?.email?.split("@")[0] ||
        "Hero";

      profile = {
        id: userId,
        email: authUser?.email ?? "",
        username,
        level: 1,
        xp: 0,
        maxXp: 100,
        gold: 500,
        gems: 30,
        createdAt: new Date().toISOString(),
      };

      await kv.set(`profile:${userId}`, profile);
      console.log("Auto-created missing profile for user:", userId);
    }

    return c.json({ profile });
  } catch (err) {
    console.log("Get profile error:", err);
    return c.json({ error: `Server error saat mengambil profil: ${err}` }, 500);
  }
});

// ─── PUT /profile ─────────────────────────────────────────────────────────────
app.put("/make-server-516bfa70/profile", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.header("Authorization") ?? null);
    if (!userId) {
      return c.json({ error: "Unauthorized: token tidak valid." }, 401);
    }

    const updates = await c.req.json();
    const existing = await kv.get(`profile:${userId}`);
    if (!existing) {
      return c.json({ error: "Profil tidak ditemukan." }, 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id: userId,
      email: (existing as any).email,
    };

    await kv.set(`profile:${userId}`, updated);
    return c.json({ profile: updated });
  } catch (err) {
    console.log("Update profile error:", err);
    return c.json({ error: `Server error saat update profil: ${err}` }, 500);
  }
});

Deno.serve(app.fetch);
