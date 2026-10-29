import { validateFields } from "./lib.js";
import { localDay, occurrence, onDay, total, completed } from "./lib.js";
import { formatInTimeZone } from "date-fns-tz";

export function automaticOccurrence(day, timezone, now = new Date()) {
  return localDay(now, timezone) === day
    ? now.toISOString()
    : occurrence(day, formatInTimeZone(now, timezone, "HH:mm"), timezone);
}

export function rolloverDay(selected, lastToday, today) {
  return lastToday !== today ? today : selected;
}

export function latestCompletion(logs, activityId) {
  return logs
    .filter((log) => completed([log], activityId))
    .sort((a, b) =>
      (b.occurred_at ?? "").localeCompare(a.occurred_at ?? ""),
    )[0];
}

export function goalProgress(activity, item, logs, day, timezone) {
  const goal = Number(item ? item.goal : activity.daily_goal);
  if (!Number.isFinite(goal) || goal <= 0) return null;
  const daily = !item || item.goal_period === "daily";
  const relevant = daily ? onDay(logs, day, timezone) : logs;
  const value = activity.quantity_field_id
    ? total(relevant, activity.id, item?.id)
    : relevant.filter(
        (l) =>
          l.activity_id === activity.id && (!item || l.item_id === item.id),
      ).length;
  const remaining = Math.max(0, Math.round((goal - value) * 1e8) / 1e8);
  const unit = activity.quantity_field_id ? activity.unit : "entries";
  return {
    goal,
    value,
    daily,
    remaining,
    text: remaining
      ? `${remaining.toLocaleString()} ${unit} to go`
      : value > goal
        ? `Goal reached! ${Math.round((value - goal) * 1e8) / 1e8} ${unit} extra`
        : "Goal reached!",
  };
}

export function completionOnly(activity) {
  return activity.fields.length === 1 && activity.fields[0].type === "boolean";
}
export function quickAmounts(goal, remaining = goal) {
  if (!Number.isFinite(goal) || goal <= 0) return [1];
  const divisor = goal <= 36 ? 3 : 9;
  const ideal = goal / divisor;
  const candidates = Array.from({ length: 11 }, (_, i) => goal / (i + 2))
    .filter(n => Number.isInteger(n) && n >= 1);
  const base = candidates.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0]
    ?? Math.max(1, Math.round(ideal));
  let suggested = goal <= 12 ? [1, base] : [base, base * 2, base * 3];
  suggested = suggested.filter(n => n <= goal);
  if (remaining > 0 && remaining <= Math.max(...suggested, 1)) {
    suggested = suggested.filter(n => n < remaining).slice(0, 2);
    suggested.push(remaining);
  }
  return [...new Set([1, ...suggested])].sort((a, b) => a - b);
}

export function quickQuantityValues(activity, amount = 1) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!activity || activity.archived || !activity.quantity_field_id) return null;
  const values = Object.fromEntries(activity.fields
    .filter(f => f.default_value != null)
    .map(f => [f.id, f.default_value]));
  values[activity.quantity_field_id] = amount;
  return Object.keys(validateFields(activity.fields, values)).length ? null : values;
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
