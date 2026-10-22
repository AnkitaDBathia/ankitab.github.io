import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, format } from "date-fns";
export const localDay = (timestamp, timezone) =>
  formatInTimeZone(timestamp, timezone, "yyyy-MM-dd");
export const moveDay = (day, offset) =>
  format(addDays(new Date(`${day}T12:00:00`), offset), "yyyy-MM-dd");
export function occurrence(day, time, timezone) {
  const wall = `${day}T${time}:00`;
  const utc = fromZonedTime(wall, timezone);
  if (formatInTimeZone(utc, timezone, "yyyy-MM-dd'T'HH:mm:ss") !== wall)
    throw new Error(
      "This local time does not exist in your timezone. Choose a different time.",
    );
  return utc.toISOString();
}
export function validateFields(fields, values) {
  const errors = {};
  for (const f of fields) {
    const v = values[f.id];
    if (v === undefined || v === "") {
      if (f.required) errors[f.id] = `${f.label} is required.`;
      continue;
    }
    if (f.type === "number" || f.type === "duration") {
      if (typeof v !== "number" || !Number.isFinite(v))
        errors[f.id] = "Enter a valid number.";
      else if (f.min !== null && v < f.min) errors[f.id] = `Minimum: ${f.min}.`;
      else if (f.max !== null && v > f.max) errors[f.id] = `Maximum: ${f.max}.`;
    } else if (f.type === "boolean" && typeof v !== "boolean")
      errors[f.id] = "Choose a completion status.";
    else if (f.type === "select" && !f.options.includes(String(v)))
      errors[f.id] = "Select a listed option.";
    else if (
      f.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ||
        Number.isNaN(Date.parse(String(v))) ||
        new Date(String(v)).toISOString().slice(0, 10) !== v)
    )
      errors[f.id] = "Enter a valid date.";
    else if (
      ["text", "multiline"].includes(f.type) &&
      (typeof v !== "string" || v.length > 10000)
    )
      errors[f.id] = "Use text of at most 10,000 characters.";
  }
  return errors;
}
export const quantity = (log) => {
  const value = log.quantity_field_id ? log.values[log.quantity_field_id] : 0;
  return typeof value === "number" ? value : 0;
};
export const total = (logs, activityId, itemId) =>
  logs
    .filter(
      (l) => l.activity_id === activityId && (!itemId || l.item_id === itemId),
    )
    .reduce((s, l) => s + quantity(l), 0);
export const onDay = (logs, day, tz) =>
  logs.filter((l) => localDay(l.occurred_at, tz) === day);
export const completed = (logs, id) =>
  logs.some(
    (l) =>
      l.activity_id === id &&
      l.field_snapshot.some(
        (f) => f.type === "boolean" && l.values[f.id] === true,
      ),
  );
export function validateActivity(a) {
  if (!a.name.trim()) throw new Error("Activity name is required.");
  if (new Set(a.fields.map((f) => f.id)).size !== a.fields.length)
    throw new Error("Field IDs must be unique.");
  if (
    a.quantity_field_id &&
    !a.fields.some(
      (f) =>
        f.id === a.quantity_field_id && ["number", "duration"].includes(f.type),
    )
  )
    throw new Error("Choose a numeric summary field.");
  for (const f of a.fields) {
    if (!f.label.trim()) throw new Error("Every field needs a label.");
    if (f.min !== null && f.max !== null && f.min > f.max)
      throw new Error("Minimum cannot exceed maximum.");
    if (
      f.type === "select" &&
      (!f.options.length ||
        f.options.some((o) => !o.trim()) ||
        new Set(f.options).size !== f.options.length)
    )
      throw new Error("Dropdowns need distinct, non-empty options.");
    if (
      f.default_value !== null &&
      Object.keys(
        validateFields([{ ...f, required: false }], {
          [f.id]: f.default_value,
        }),
      ).length
    )
      throw new Error(`Invalid default for ${f.label}.`);
  }
  if (a.presets.some((p) => !Number.isFinite(p) || p <= 0))
    throw new Error("Presets must be positive numbers.");
}
