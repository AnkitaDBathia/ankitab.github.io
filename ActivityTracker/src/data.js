import { supabase } from "./supabase.js";
import { guestMode } from "./mode.js";
import { createGuestStore } from "./guest.js";
const guest = () => createGuestStore(window.localStorage);
const db = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};
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
  const logs = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db()
      .from("activity_logs")
      .select("*")
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(start, start + 999);
    if (error) throw error;
    logs.push(...data);
    if (data.length < 1000) break;
  }
  return {
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
