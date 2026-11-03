import { supabase } from "./supabase.js";
import { guestMode } from "./mode.js";
import { createGuestStore } from "./guest.js";
const guest = () => createGuestStore(window.localStorage);
const db = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};
async function readRows(query) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await query.range(start, start + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
export async function loadJourney() {
  if (guestMode) return guest().load();
  const init = await db().rpc("initialize_journey");
  if (init.error) throw init.error;
  const results = await Promise.all([
    db().from("activities").select("*").order("position"),
    db().from("activity_items").select("*").order("created_at"),
    db().from("user_settings").select("*").single(),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [logs, revisions, reflections] = await Promise.all([
    readRows(db().from("activity_logs").select("*").order("occurred_at", { ascending: false }).order("id")),
    readRows(db().from("habit_revisions").select("*").order("id")),
    readRows(db().from("weekly_reflections").select("*").order("week_start").order("id")),
  ]);
  const access = await db().from("account_admins").select("user_id").limit(1);
  // Existing journals keep working while the optional admin migration is deployed.
  if (access.error && !["42P01", "PGRST205"].includes(access.error.code)) throw access.error;
  return {
    canCreateAccounts: !access.error && access.data.length > 0,
    revisions, reflections,
    activities: results[0].data,
    items: results[1].data,
    settings: results[2].data,
    logs,
  };
}
export async function saveRow(table, row, id) {
  if (guestMode) return guest().save(table, row, id);
  const result = id
    ? await db()
        .from(table)
        .update(row)
        .eq(table === "user_settings" ? "user_id" : "id", id)
        .select()
        .single()
    : await db().from(table).insert(row).select().single();
  if (result.error) throw result.error;
  return result.data;
}
export async function deleteLog(id) {
  if (guestMode) return guest().remove(id);
  const { error } = await db().from("activity_logs").delete().eq("id", id);
  if (error) throw error;
}
