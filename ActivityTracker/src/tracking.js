import { validateFields } from "./lib.js";
import { localDay, occurrence } from "./lib.js";
import { formatInTimeZone } from "date-fns-tz";

export function automaticOccurrence(day, timezone, now = new Date()) {
  return localDay(now, timezone) === day
    ? now.toISOString()
    : occurrence(day, formatInTimeZone(now, timezone, "HH:mm"), timezone);
}

export function completionOnly(activity) {
  return activity.fields.length === 1 && activity.fields[0].type === "boolean";
}
// Only offer a one-tap action when all required information can be supplied.
export function quickDoneValues(activity) {
  if (activity.item_based || activity.archived) return null;
  const booleans = activity.fields.filter((f) => f.type === "boolean");
  if (booleans.length !== 1) return null;
  const values = Object.fromEntries(
    activity.fields
      .filter((f) => f.default_value !== null)
      .map((f) => [f.id, f.default_value]),
  );
  values[booleans[0].id] = true;
  return Object.keys(validateFields(activity.fields, values)).length
    ? null
    : values;
}
export function simpleFields(mode, activity) {
  const type = mode === "done" ? "boolean" : "number";
  const previous = activity?.fields.find((f) => f.type === type);
  return [
    {
      id: previous?.id ?? crypto.randomUUID(),
      label: mode === "done" ? "Completed" : "Quantity",
      type,
      required: true,
      default_value: mode === "done" ? true : 1,
      position: 0,
      options: [],
      min: mode === "done" ? null : 1,
      max: null,
    },
  ];
}
