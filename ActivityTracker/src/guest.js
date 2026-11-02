import { typeOf, configurationSnapshot, dayConfiguration, outcomes, habitDay } from "./habits.js";
import { localDay } from "./lib.js";
import { moods } from "./journal.js";
import { validateActivity, validateFields } from "./lib.js";
export const GUEST_ID = "local-guest";
export const STORAGE_KEY = "my-journey.guest.v1";
function initialJournal() {
  const quantity = {
    id: "quantity",
    label: "Quantity",
    type: "number",
    required: true,
    default_value: 1,
    position: 0,
    options: [],
    min: 1,
    max: 1000000,
  };
  const field = (id, label, type, extra = {}) => ({
    id,
    label,
    type,
    required: false,
    default_value: null,
    position: 0,
    options: [],
    min: null,
    max: null,
    ...extra,
  });
  const practice = [
    field("completed", "Completed", "boolean", {
      required: true,
      default_value: true,
    }),
    field("type", "Type", "select", {
      required: true,
      default_value: "General",
      options: ["General", "Gentle", "Guided"],
      position: 1,
    }),
    field("duration", "Duration (minutes)", "duration", {
      min: 0,
      max: 1440,
      position: 2,
    }),
    field("notes", "Notes", "multiline", { position: 3 }),
  ];
  const definitions = [
    ["water", "Water", "water", "glasses", false, [1, 2, 3]],
    ["reading", "Reading", "book", "pages", true, [1, 2, 5]],
    ["mantra", "Mantra", "sun", "chants", true, [1, 11, 108]],
    ["yoga", "Yoga", "leaf", "minutes", false, []],
    ["meditation", "Meditation", "moon", "minutes", false, []],
  ];
  return {
    version: 1,
    settings: {
      user_id: GUEST_ID,
      display_name: "My friend",
      timezone: "Asia/Kolkata",
      appearance: "system",
    },
    activities: definitions.map(
      ([key, name, icon, unit, item_based, presets], position) => ({
        id: crypto.randomUUID(),
        user_id: GUEST_ID,
        seed_key: key,
        name,
        icon,
        unit,
        item_based,
        presets,
        position,
        description: "A small moment for yourself.",
        archived: false,
        version: 1,
        fields: structuredClone(position < 3 ? [quantity] : practice),
        quantity_field_id: position < 3 ? "quantity" : "duration",
      }),
    ),
    items: [],
    logs: [],
  };
}
export function createGuestStore(storage) {
  function initialiseMetadata(data) {
    data.reflections ??= [];
    data.revisions ??= data.activities.map(a=>({id:crypto.randomUUID(),activity_id:a.id,user_id:GUEST_ID,effective_day:localDay(new Date(),data.settings.timezone),snapshot:configurationSnapshot(a,data.items)}));
  }
  function recordRevision(data,a) {
    const day=localDay(new Date(),data.settings.timezone);
    const old=data.revisions.find(r=>r.activity_id===a.id&&r.effective_day===day);
    const row={id:old?.id??crypto.randomUUID(),user_id:GUEST_ID,activity_id:a.id,effective_day:day,snapshot:configurationSnapshot(a,data.items)};
    data.revisions=old?data.revisions.map(r=>r.id===old.id?row:r):[...data.revisions,row];
  }
  function write(data) {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function load() {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      const data = initialJournal();
      initialiseMetadata(data);
      write(data);
      return data;
    }
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !data.settings ||
      !Array.isArray(data.activities) ||
      !Array.isArray(data.items) ||
      !Array.isArray(data.logs)
    )
      throw new Error(
        "The browser journal could not be read. Existing data has not been overwritten.",
      );
    if (!data.revisions || !data.reflections) {initialiseMetadata(data);write(data);}
    return data;
  }
  function save(table, patch, id) {
    const data = load();
    const now = new Date().toISOString();
    if (table === "user_settings") {
      const next = { ...data.settings, ...patch, user_id: GUEST_ID };
      if (!next.display_name.trim()) throw new Error("Name is required.");
      new Intl.DateTimeFormat("en", { timeZone: next.timezone }).format();
      data.settings = next;
      write(data);
      return next;
    }
    const key = {
      activities: "activities",
      activity_items: "items",
      activity_logs: "logs",
      weekly_reflections: "reflections",
    }[table];
    if (!key) throw new Error("Unknown table");
    const old = id ? data[key].find((r) => r.id === id) : null;
    if (id && !old) throw new Error("Record not found.");
    const row = {
      ...old,
      ...patch,
      id: old?.id ?? patch.id ?? crypto.randomUUID(),
      user_id: GUEST_ID,
      created_at: old?.created_at ?? now,
      updated_at: now,
    };
    if (!id && data[key].some((r) => r.id === row.id))
      throw new Error("This entry was already saved. Refresh to see it.");
    if (table === "activities") {
      Object.assign(row, {
        archived: row.archived ?? false,
        seed_key: old?.seed_key ?? null,
        version: (old?.version ?? 0) + 1,
      });
      validateActivity(row);
      if(old && typeOf(old)!==typeOf(row) && data.logs.some(l=>l.activity_id===id)) throw new Error("A habit with history keeps its type.");
      if (
        old &&
        old.item_based !== row.item_based &&
        data.logs.some((l) => l.activity_id === id)
      )
        throw new Error("Item mode cannot change after logging.");
    }
    if (table === "activity_items") {
      if (row.favourite != null && typeof row.favourite !== "boolean") throw new Error("Invalid favourite.");
      if (!row.name.trim()) throw new Error("Item name is required.");
      if (!data.activities.some((a) => a.id === row.activity_id))
        throw new Error("Activity unavailable.");
      if (row.goal !== null && (!Number.isFinite(row.goal) || row.goal <= 0))
        throw new Error("Goal must be positive.");
      if (
        row.goal_period != null &&
        !["daily", "total"].includes(row.goal_period)
      )
        throw new Error("Invalid target period.");
      row.archived = row.archived ?? false;
    }
    if (table === "activity_logs") {
      if (row.mood != null && !moods.includes(row.mood)) throw new Error("Invalid mood.");
      if (row.mood_note != null && (typeof row.mood_note !== "string" || row.mood_note.length > 10000)) throw new Error("Invalid mood note.");
      const a = data.activities.find((a) => a.id === row.activity_id);
      if (!a || (!old && a.archived)) throw new Error("Activity unavailable.");
      if (
        old &&
        (row.activity_id !== old.activity_id || row.item_id !== old.item_id)
      )
        throw new Error("Log identity is immutable.");
      if (
        !old &&
        a.item_based &&
        !data.items.some(
          (i) => i.id === row.item_id && i.activity_id === a.id && !i.archived,
        )
      )
        throw new Error("Select an active item.");
      row.habit_type=old?.habit_type??typeOf(a);
      row.habit_timezone=old?old.habit_timezone:data.settings.timezone;
      row.habit_day=row.habit_timezone?localDay(row.occurred_at,row.habit_timezone):null;
      row.habit_snapshot=old && row.habit_day===old.habit_day?old.habit_snapshot:dayConfiguration(data,a,row.habit_day);
      row.measurement_unit=old?old.measurement_unit:a.unit;
      if(row.habit_type==='build'&&row.outcome!=null) throw new Error('Build entries use measurements.');
      if(row.habit_type!=='build'&&!outcomes[row.habit_type].some(([o])=>o===row.outcome)) throw new Error('Choose an outcome.');
      if(row.habit_type==='maintain'&&data.logs.some(l=>l.id!==row.id&&l.activity_id===row.activity_id&&habitDay(l,data.settings.timezone)===row.habit_day)) throw new Error('This boundary already has an entry for this date. Edit that entry.');
      if(row.habit_note && row.habit_note.length>10000) throw new Error('Note is too long.');
      row.field_snapshot = old?.field_snapshot ?? structuredClone(a.fields);
      row.quantity_field_id = old ? old.quantity_field_id : a.quantity_field_id;
      const errors = validateFields(row.field_snapshot, row.values);
      if (Object.keys(errors).length)
        throw new Error(Object.values(errors).join(" "));
      if (!Number.isFinite(Date.parse(row.occurred_at)))
        throw new Error("Invalid occurrence time.");
    }
    if(table==='weekly_reflections') {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(row.week_start)||new Date(row.week_start+'T12:00:00Z').getUTCDay()!==1) throw new Error('Choose a Monday week start.');
      if(data.reflections.some(r=>r.id!==row.id&&r.week_start===row.week_start)) throw new Error('This week already has a reflection.');
      for(const field of ['went_well','difficult','next_step']) if(typeof row[field]!=='string'||row[field].length>10000) throw new Error('Invalid reflection.');
    }
    data[key] = id
      ? data[key].map((r) => (r.id === id ? row : r))
      : [...data[key], row];
    if(table==='activities') recordRevision(data,row);
    if(table==='activity_items') recordRevision(data,data.activities.find(a=>a.id===row.activity_id));
    write(data);
    return row;
  }
  function remove(id) {
    const data = load();
    data.logs = data.logs.filter((l) => l.id !== id);
    write(data);
  }
  return { load, save, remove };
}
