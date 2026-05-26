import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: kun administratorer");
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(128),
        role: z.enum(["admin", "saelger", "salgssupport"]),
        region: z.string().trim().max(120).optional().nullable(),
        salesperson_no: z.string().trim().max(32).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Kunne ikke oprette bruger");
    }
    const uid = created.user.id;

    // Trigger creates profile + default 'saelger' role. Sync fields.
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        region: data.region ?? null,
        is_active: true,
        salesperson_no: data.salesperson_no ?? null,
      })
      .eq("id", uid);
    if (profErr) throw new Error(profErr.message);

    if (data.role !== "saelger") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: uid, role: data.role });
      if (roleErr) throw new Error(roleErr.message);
    }

    return { id: uid };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        full_name: z.string().trim().min(1).max(120),
        role: z.enum(["admin", "saelger"]),
        region: z.string().trim().max(120).optional().nullable(),
        salesperson_no: z.string().trim().max(32).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        region: data.region ?? null,
        salesperson_no: data.salesperson_no ?? null,
      })
      .eq("id", data.user_id);
    if (profErr) throw new Error(profErr.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true };
  });

export const adminSetUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        is_active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    if (data.user_id === context.userId && !data.is_active) {
      throw new Error("Du kan ikke deaktivere dig selv");
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.user_id);
    if (profErr) throw new Error(profErr.message);

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      { ban_duration: data.is_active ? "none" : "876000h" },
    );
    if (authErr) throw new Error(authErr.message);

    return { ok: true };
  });

export const adminResetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        new_password: z.string().min(8).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      { password: data.new_password },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        email: z.string().trim().email().max(255),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.user_id,
      { email: data.email, email_confirm: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);

    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, region, is_active, created_at, salesperson_no");
    if (profErr) throw new Error(profErr.message);

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const { data: authList, error: authErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authErr) throw new Error(authErr.message);

    const emailMap = new Map<string, string>();
    for (const u of authList.users) emailMap.set(u.id, u.email ?? "");

    const roleMap = new Map<string, "admin" | "saelger">();
    for (const r of roles ?? []) {
      // admin wins if multiple rows exist
      if (r.role === "admin" || !roleMap.has(r.user_id)) {
        roleMap.set(r.user_id, r.role as "admin" | "saelger");
      }
    }

    return (profiles ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: emailMap.get(p.id) ?? "",
      role: roleMap.get(p.id) ?? "saelger",
      region: p.region,
      salesperson_no: p.salesperson_no ?? null,
      is_active: p.is_active,
      created_at: p.created_at,
    }));
  });
