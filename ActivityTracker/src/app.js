import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "./supabase.js";
import { guestMode } from "./mode.js";
import {
  quickDoneValues,
  automaticOccurrence,
  rolloverDay,
  goalProgress,
  quickQuantityValues,
} from "./tracking.js";
import { completed, onDay } from "./lib.js";
import { GUEST_ID } from "./guest.js";
import { deleteLog, loadJourney, saveRow } from "./data.js";
import { localDay, moveDay, occurrence, validateFields } from "./lib.js";
import { activityForm, entryForm, itemForm } from "./forms.js";
import { authView, renderView } from "./views.js";
import { notify, sheet, valueOf } from "./ui.js";
import { createResumeSync } from "./sync.js";

const root = document.getElementById("root");
const state = {
  page: location.hash.slice(1) || "dashboard",
  day: localDay(new Date(), "Asia/Kolkata"),
  filter: "",
  itemFilter: "",
  showArchived: false,
  period: 7,
};
let data = null,
  session = null,
  authMode = location.hash.includes("type=recovery") ? "recovery" : "login",
  loadVersion = 0,
  loading = false;
let lastToday = null;
let writeVersion = 0;
function canAutoSync() {
  return !!session && !!data && !guestMode && authMode !== "recovery" &&
    !document.hidden && !loading && !pending.size && !undoPending.size &&
    !document.querySelector("dialog") && state.page !== "settings" &&
    !document.activeElement?.matches("input,textarea,select");
}
const resumeSync = createResumeSync({
  canRun: canAutoSync,
  run: () => refresh(true),
  onError: () => notify("Could not sync. Your displayed entries are unchanged. Use Refresh to retry."),
});
function checkDay() {
  if (!data) return;
  const today = localDay(new Date(), data.settings.timezone);
  if (lastToday && lastToday !== today) {
    state.day = rolloverDay(state.day, lastToday, today);
    // Close stale entry forms so a new day never silently saves yesterday.
    document.querySelectorAll("dialog").forEach((d) => d.remove());
    notify("A new day - switched to today.");
  }
  lastToday = today;
}
function resumeDay() {
  const previous = lastToday;
  checkDay();
  if (data && previous !== lastToday) render();
  if (session && data && !guestMode) resumeSync.request();
}
window.addEventListener("focus", resumeDay);
window.addEventListener("online", resumeDay);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resumeDay();
});
setInterval(() => {
  if (!document.hidden && data) {
    const previous = lastToday;
    checkDay();
    if (previous !== lastToday) render();
  }
}, 30000);
const media = matchMedia("(prefers-color-scheme: dark)");
function appearance() {
  const mode = data?.settings.appearance ?? "system";
  document.documentElement.dataset.theme =
    mode === "system" ? (media.matches ? "dark" : "light") : mode;
}
media.addEventListener("change", appearance);
function render() {
  appearance();
  root.innerHTML =
    !session || authMode === "recovery"
      ? authView(authMode)
      : data
        ? renderView(data, state, session.user.email ?? "")
        : '<div class="loading" role="status">Opening your journey…</div>';
}
function showError(error) {
  let el = root.querySelector("[data-error]");
  if (!el) {
    root.innerHTML = `<div class="setup"><h2>Could not load your journal</h2><p data-error></p><button data-action="refresh">Try again</button>${guestMode ? "" : '<button data-action="signout">Sign out</button>'}</div>`;
    el = root.querySelector("[data-error]");
  }
  el.hidden = false;
  el.textContent = error.message ?? String(error);
}
async function refresh(background = false) {
  if (!session || loading) return false;
  const writes = writeVersion;
  loading = true;
  const version = ++loadVersion;
  const owner = session.user.id;
  try {
    const next = await loadJourney();
    if (version !== loadVersion || session?.user.id !== owner) return;
    // A form or write may have started while the request was in flight.
    if (background && (writes !== writeVersion || pending.size || undoPending.size ||
      document.hidden || document.querySelector("dialog") || state.page === "settings" ||
      document.activeElement?.matches("input,textarea,select"))) return false;
    if (!data) state.day = localDay(new Date(), next.settings.timezone);
    data = next;
    checkDay();
    render();
  } catch (e) {
    if (background) throw e;
    if (version === loadVersion) showError(e);
  } finally {
    if (version === loadVersion) loading = false;
  }
}
async function mutate(table, row, id) {
  writeVersion++;
  const owner = session.user.id;
  const saved = await saveRow(table, { ...row, user_id: owner }, id);
  if (session?.user.id !== owner) return;
  if (table === "user_settings") data.settings = saved;
  else {
    const key =
      table === "activities"
        ? "activities"
        : table === "activity_items"
          ? "items"
          : "logs";
    data[key] = id
      ? data[key].map((r) => (r.id === id ? saved : r))
      : [...data[key], saved];
  }
  render();
  if (table === "activity_logs") {
    const activity = data.activities.find((a) => a.id === saved.activity_id);
    const item = data.items.find((i) => i.id === saved.item_id);
    const day = localDay(saved.occurred_at, data.settings.timezone);
    const when =
      day === localDay(new Date(), data.settings.timezone) ? "today" : day;
    const progress =
      goalProgress(activity, item, data.logs, day, data.settings.timezone) ??
      goalProgress(activity, null, data.logs, day, data.settings.timezone);
    notify(
      `${item?.name ?? activity.name} saved for ${when}${progress ? ` - ${progress.text}` : ""}.`,
      id ? undefined : () => undoEntry(saved.id),
    );
  } else notify("Saved.");
}
const undoPending = new Set();
async function undoEntry(id) {
  if (undoPending.has(id) || !data?.logs.some((l) => l.id === id)) return;
  undoPending.add(id);
  writeVersion++;
  const owner = session?.user.id;
  try {
    await deleteLog(id);
    if (session?.user.id !== owner) return;
    data.logs = data.logs.filter((l) => l.id !== id);
    render();
    notify("Entry undone.");
  } finally {
    undoPending.delete(id);
  }
}
function confirm(title, run) {
  sheet(
    title,
    '<p>Confirm this change. Archived items keep their history; deleted entries cannot be restored.</p><button class="primary">Confirm</button>',
    run,
  );
}
function openEntry(activity, edit, item) {
  entryForm(
    activity,
    data.items.filter((i) => i.activity_id === activity.id),
    data.logs,
    state.day,
    data.settings.timezone,
    (row, id) => mutate("activity_logs", row, id),
    edit,
    item,
  );
}
const pending = new Set();
root.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const { action, id } = target.dataset;
  const oldDay = state.day;
  checkDay();
  if (oldDay !== state.day) {
    render();
    return;
  }
  const key = action + id;
  if (pending.has(key)) return;
  pending.add(key);
  target.disabled = true;
  const originalLabel = target.textContent;
  if (["mark-done", "water", "undo-log", "increment-item"].includes(action))
    target.textContent = action === "undo-log" ? "Undoing..." : "Saving...";
  try {
    if (action === "auth-mode") {
      authMode = authMode === "reset" ? "login" : "reset";
      render();
      return;
    }
    if (action === "signout") {
      if (guestMode) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return;
    }
    if (action === "refresh") {
      await refresh();
      return;
    }
    if (!data) return;
    const activity = data.activities.find((a) => a.id === id);
    const item = data.items.find((i) => i.id === id);
    const log = data.logs.find((l) => l.id === id);
    if (action === "undo-log") {
      await undoEntry(id);
      return;
    }
    if (action === "mark-done") {
      if (completed(onDay(data.logs, state.day, data.settings.timezone), id))
        return;
      const values = quickDoneValues(activity);
      if (!values) {
        openEntry(activity);
        return;
      }
      await mutate("activity_logs", {
        id: crypto.randomUUID(),
        activity_id: id,
        item_id: null,
        values,
        occurred_at: automaticOccurrence(state.day, data.settings.timezone),
      });
      return;
    }
    if (
      action === "previous-day" ||
      action === "next-day" ||
      action === "today"
    ) {
      state.day =
        action === "today"
          ? localDay(new Date(), data.settings.timezone)
          : moveDay(state.day, action === "previous-day" ? -1 : 1);
      render();
    }
    if (action === "create-activity" || action === "configure")
      activityForm((row, id) => mutate("activities", row, id), activity);
    if (action === "entry") openEntry(activity);
    if (action === "increment-item") {
      const parent = data.activities.find(a => a.id === item?.activity_id);
      const values = quickQuantityValues(parent, Number(target.dataset.amount ?? 1));
      if (!item || item.archived || !values)
        throw new Error("Quick add requires valid defaults for all required fields. Update the activity configuration.");
      await mutate("activity_logs", {
        id: crypto.randomUUID(),
        activity_id: parent.id,
        item_id: item.id,
        values,
        occurred_at: automaticOccurrence(state.day, data.settings.timezone),
      });
      return;
    }
    if (action === "entry-item")
      openEntry(
        data.activities.find((a) => a.id === item.activity_id),
        undefined,
        item.id,
      );
    if (action === "edit-log")
      openEntry(
        data.activities.find((a) => a.id === log.activity_id),
        log,
      );
    if (action === "add-item" || action === "edit-item")
      itemForm(
        activity ?? data.activities.find((a) => a.id === item.activity_id),
        (row, id) => mutate("activity_items", row, id),
        item,
      );
    if (action === "archive-activity")
      confirm(
        activity.archived ? "Restore activity?" : "Archive activity?",
        () => mutate("activities", { archived: !activity.archived }, id),
      );
    if (action === "archive-item")
      confirm(item.archived ? "Restore item?" : "Archive item?", () =>
        mutate("activity_items", { archived: !item.archived }, id),
      );
    if (action === "delete-log")
      confirm("Delete this entry?", async () => {
        writeVersion++;
        await deleteLog(id);
        data.logs = data.logs.filter((l) => l.id !== id);
        render();
        notify("Entry deleted.");
      });
    if (action === "water") {
      const values = Object.fromEntries(
        activity.fields
          .filter((f) => f.default_value !== null)
          .map((f) => [f.id, f.default_value]),
      );
      if (activity.quantity_field_id) values[activity.quantity_field_id] = 1;
      if (
        activity.item_based ||
        !activity.quantity_field_id ||
        Object.keys(validateFields(activity.fields, values)).length
      ) {
        openEntry(activity);
        return;
      }
      await mutate("activity_logs", {
        id: crypto.randomUUID(),
        activity_id: id,
        item_id: null,
        values,
        occurred_at: occurrence(
          state.day,
          formatInTimeZone(new Date(), data.settings.timezone, "HH:mm"),
          data.settings.timezone,
        ),
      });
    }
  } catch (e) {
    showError(
      new Error(`Could not save the change. Please retry. ${e.message ?? e}`),
    );
  } finally {
    pending.delete(key);
    target.disabled = false;
    target.textContent = originalLabel;
  }
});
root.addEventListener("change", (e) => {
  const control = e.target;
  switch (control.dataset.change) {
    case "day":
      if (control.value) state.day = control.value;
      break;
    case "archived":
      state.showArchived = control.checked;
      break;
    case "filter":
      state.filter = control.value;
      break;
    case "item-filter":
      state.itemFilter = control.value;
      break;
    case "period":
      state.period = Number(control.value);
      break;
    case "report-end":
      if (control.value) state.reportEnd = control.value;
      break;
    case "report-activity":
      state.reportActivity = control.value;
      break;
    default:
      return;
  }
  render();
});
root.addEventListener("submit", async (e) => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  if (form.dataset.busy) return;
  form.dataset.busy = "true";
  const submit = form.querySelector('button[type="submit"],button:not([type])');
  submit.disabled = true;
  const message = form.querySelector("[data-auth-message],.error");
  message.textContent = "";
  try {
    if (kind === "settings") {
      const timezone = valueOf(form, "timezone").trim();
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
      await mutate(
        "user_settings",
        {
          display_name: valueOf(form, "display_name").trim(),
          timezone,
          appearance: valueOf(form, "appearance"),
        },
        session.user.id,
      );
    }
    if (kind === "auth") {
      const email = valueOf(form, "email"),
        password = valueOf(form, "password");
      const result =
        authMode === "recovery"
          ? await supabase.auth.updateUser({ password })
          : authMode === "reset"
            ? await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: new URL("../", import.meta.url).href,
              })
            : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (authMode === "recovery") {
        authMode = "login";
        render();
        await refresh();
        notify("Password updated.");
      } else if (authMode === "reset")
        message.textContent = "Check your email for a recovery link.";
    }
  } catch (e) {
    message.textContent = e.message;
  } finally {
    delete form.dataset.busy;
    submit.disabled = false;
  }
});
window.addEventListener("hashchange", () => {
  if (
    location.hash.includes("access_token") ||
    location.hash.includes("type=recovery")
  )
    return;
  state.page = location.hash.slice(1) || "dashboard";
  state.itemFilter = "";
  if (session && data) render();
});
function acceptSession(next, event) {
  const changed = next?.user.id !== session?.user.id;
  session = next;
  if (event === "PASSWORD_RECOVERY") authMode = "recovery";
  if (changed) {
    resumeSync.cancel();
    loadVersion++;
    loading = false;
    data = null;
    lastToday = null;
    document.querySelector(".toast")?.remove();
    document.querySelectorAll("dialog").forEach((d) => d.remove());
    state.filter = "";
    state.itemFilter = "";
  }
  if (!session) {
    authMode = "login";
    render();
  } else if (authMode === "recovery") render();
  else if (changed || !data) {
    render();
    setTimeout(() => void refresh(), 0);
  }
}
if (guestMode) {
  authMode = "login";
  session = { user: { id: GUEST_ID, email: "" } };
  render();
  void refresh();
} else if (!supabase) {
  root.innerHTML =
    '<main class="setup"><h1>My Journey</h1><h2>Your private space is almost ready.</h2><p>Set your Supabase project URL and publishable key in <code>config.js</code>, then reload. Run the database migration in Supabase before signing in.</p></main>';
} else {
  let observed = false;
  supabase.auth.onAuthStateChange((event, next) => {
    observed = true;
    acceptSession(next, event);
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) showError(error);
    else if (!observed) acceptSession(data.session, "INITIAL_SESSION");
  });
}
