import { typeOf, habitDay, dayConfiguration, weekStart } from "./habits.js";
import { outcomeForm, reflectionForm } from "./habit-ui.js";
import { signIn } from "./login.js";
import { createAccount, createAccountForm } from "./accounts.js";
import { supabase } from "./supabase.js";
import { guestMode } from "./mode.js";
import {
  quickDoneValues,
  automaticOccurrence,
  rolloverDay,
  goalProgress,
  quickQuantityValues,
} from "./tracking.js";
import { GUEST_ID } from "./guest.js";
import { deleteLog, loadJourney, saveRow } from "./data.js";
import { completed, onDay, localDay, moveDay, defaultValues, validateFields } from "./lib.js";
import { activityForm, entryForm, itemForm } from "./forms.js";
import { authView, renderView } from "./views.js";
import { notify, sheet, valueOf } from "./ui.js";
import { createResumeSync } from "./sync.js";

const root = document.getElementById("root");
// Keep panel choices through logging, refreshes and page navigation in this session.
root.addEventListener("toggle", e => {
  if (e.target.isConnected && e.target.dataset.panel) {
    state.panels ??= {};
    state.panels[e.target.dataset.panel] = e.target.open;
  }
}, true);
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
          : table === "weekly_reflections" ? "reflections" : "logs";
    data[key] = id
      ? data[key].map((r) => (r.id === id ? saved : r))
      : [...data[key], saved];
  }
  if (["activities", "activity_items"].includes(table)) await refresh();
  render();
  if (table === "activity_logs") {
    const activity = data.activities.find((a) => a.id === saved.activity_id);
    const item = data.items.find((i) => i.id === saved.item_id);
    const day = habitDay(saved, data.settings.timezone);
    const when =
      day === localDay(new Date(), data.settings.timezone) ? "today" : day;
    const cfg=dayConfiguration(data,activity,day);
    const goalActivity={...activity,...cfg};
    const goalItem=item?{...item,...cfg?.items?.find(i=>i.id===item.id)}:null;
    const progress = cfg ?
      goalProgress(goalActivity, goalItem, data.logs, day, data.settings.timezone) ??
      goalProgress(goalActivity, null, data.logs, day, data.settings.timezone) : null;
    notify(
      `${item?.name ?? activity.name} saved for ${when}${progress ? ` - ${progress.text}` : ""}.`,
      id ? undefined : () => undoEntry(saved.id),
    );
  } else notify("Saved.");
}
const undoPending = new Set();
async function undoEntry(id, message = "Entry undone.") {
  if (undoPending.has(id) || !data?.logs.some((l) => l.id === id)) return;
  undoPending.add(id);
  writeVersion++;
  const owner = session?.user.id;
  try {
    await deleteLog(id);
    if (session?.user.id !== owner) return;
    data.logs = data.logs.filter((l) => l.id !== id);
    render();
    notify(message);
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
  if ((edit?.habit_type ?? typeOf(activity)) !== "build") {
    const existing=edit ?? (typeOf(activity)==="maintain" ? data.logs.find(l=>l.activity_id===activity.id&&habitDay(l,data.settings.timezone)===state.day) : undefined);
    return outcomeForm(activity,state.day,data.settings.timezone,(row,id)=>mutate("activity_logs",row,id),existing);
  }
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
function addEntry(activity, values, itemId = null) {
  return mutate("activity_logs", {
    id: crypto.randomUUID(), activity_id: activity.id, item_id: itemId,
    values, occurred_at: automaticOccurrence(state.day, data.settings.timezone),
  });
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
  if (["mark-done", "water", "undo-log", "increment-item", "habit-outcome"].includes(action))
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
    if (action === "create-account") {
      if (guestMode || !data.canCreateAccounts) throw new Error("Only the administrator can create accounts.");
      createAccountForm(async details => {
        const result = await createAccount(supabase, window.MY_JOURNEY_CONFIG, details);
        notify(`Account created for ${result.username}. They can now sign in with their username and password.`);
      });
      return;
    }
    if (action === "toggle-search") {
      state.searchOpen = !state.searchOpen;
      state.searchQuery = "";
      render();
      root.querySelector('input[name="query"]')?.focus();
      return;
    }
    if (action === "reflection") {
      const day=state.reportEnd??state.day;
      reflectionForm((row,id)=>mutate("weekly_reflections",row,id),day,data.reflections?.find(r=>r.week_start===weekStart(day)));
      return;
    }
    const activity = data.activities.find((a) => a.id === id);
    const item = data.items.find((i) => i.id === id);
    const log = data.logs.find((l) => l.id === id);
    if (action === "favourite-item") {
      await mutate("activity_items", {favourite: !item.favourite}, item.id);
      return;
    }
    if (action === "undo-log") {
      await undoEntry(id);
      return;
    }
    if (action === "habit-outcome") {
      const existing=typeOf(activity)==="maintain" ? data.logs.find(l=>l.activity_id===id&&habitDay(l,data.settings.timezone)===state.day) : undefined;
      const values=existing?.values ?? defaultValues(activity.fields);
      if(Object.keys(validateFields(existing?.field_snapshot??activity.fields,values)).length) {openEntry(activity,existing);return;}
      await mutate("activity_logs",{
        ...(existing?{}:{id:crypto.randomUUID(),activity_id:id,item_id:null}),
        values,outcome:target.dataset.outcome,
        occurred_at:existing?.occurred_at??automaticOccurrence(state.day,data.settings.timezone),
      },existing?.id);
      return;
    }
    if (action === "mark-done" || action === "water") {
      if (action === "mark-done" && completed(onDay(data.logs, state.day, data.settings.timezone), id))
        return;
      const values = action === "mark-done" ? quickDoneValues(activity)
        : activity.item_based ? null : quickQuantityValues(activity, 1);
      if (!values) {
        openEntry(activity);
        return;
      }
      await addEntry(activity, values);
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
      await addEntry(parent, values, item.id);
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
      confirm("Delete this entry?", () => undoEntry(id, "Entry deleted."));
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
  const change = control.dataset.change;
  const key = {
    day: "day", archived: "showArchived", filter: "filter",
    "item-filter": "itemFilter", period: "period",
    "report-end": "reportEnd", "report-activity": "reportActivity",
  }[change];
  if (!key) return;
  if (["day", "report-end"].includes(change) && !control.value) return;
  state[key] = change === "archived" ? control.checked
    : change === "period" ? Number(control.value) : control.value;
  render();
});
root.addEventListener("submit", async (e) => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  if (kind === "history-search") {
    state.searchQuery = valueOf(form,"query").trim();
    render();
    return;
  }
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
            : await signIn(supabase, email, password, window.MY_JOURNEY_CONFIG);
      if (result.error) throw result.error;
      if (authMode === "recovery") {
        authMode = "login";
        render();
        await refresh();
        notify("Password updated.");
      } else if (authMode === "reset")
        message.textContent = "If this email is registered, you will receive a recovery link. Without a recovery email, ask the administrator to reset your password.";
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
    state.panels = {};
    resumeSync.cancel();
    loadVersion++;
    loading = false;
    data = null;
    lastToday = null;
    document.querySelector(".toast")?.remove();
    document.querySelectorAll("dialog").forEach((d) => d.remove());
    state.searchQuery = "";
    state.searchOpen = false;
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
