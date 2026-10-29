import {
  completionOnly,
  quickDoneValues,
  latestCompletion,
  goalProgress,
} from "./tracking.js";
import { guestMode as defaultGuestMode } from "./mode.js";
import { formatInTimeZone } from "date-fns-tz";
import { completed, localDay, moveDay, onDay, total } from "./lib.js";
import { h, icon, button, input, select } from "./ui.js";
const empty =
  '<div class="empty"><h3>A fresh page in your journey</h3><p>No entries here yet. Every small step counts.</p></div>';
const cardIcon = (a) =>
  `<span class="activity-icon ${h(a.icon)}">${icon(a.icon)}</span>`;

export function activityAction(activity, daily, cls = "primary") {
  if (quickDoneValues(activity)) {
    const done = completed(daily, activity.id);
    const latest = latestCompletion(daily, activity.id);
    return `<div class="completion-actions"><button type="button" class="${h(cls)} ${done ? "is-done" : ""}" data-action="mark-done" data-id="${h(activity.id)}" ${done ? "disabled" : ""}>${done ? "Done" : "Mark done"}</button>${latest?.id ? button("Undo", "undo-log", latest.id, "text-button") : ""}${completionOnly(activity) ? "" : button("Add details", "entry", activity.id, "text-button")}</div>`;
  }
  return button(
    activity.seed_key === "water"
      ? "+ Add 1 glass"
      : `+ Log ${activity.name.toLowerCase()}`,
    activity.seed_key === "water" ? "water" : "entry",
    activity.id,
    cls,
  );
}

export function targetSummary(activity, item, data, day) {
  const progress = goalProgress(
    activity,
    item,
    data.logs,
    day,
    data.settings.timezone,
  );
  if (!progress) return "";
  return `<div class="target-summary"><small>${item ? `${h(item.name)} - ` : ""}${progress.daily ? "Daily" : "Overall"} target: ${progress.value.toLocaleString()} / ${progress.goal.toLocaleString()} ${h(activity.quantity_field_id ? activity.unit : "entries")}</small><strong>${h(progress.text)}</strong><progress aria-label="${h(item?.name ?? activity.name)} target" max="${progress.goal}" value="${Math.max(0, Math.min(progress.goal, progress.value))}"></progress></div>`;
}
function cardTargets(activity, data, day) {
  return (
    targetSummary(activity, null, data, day) +
    data.items
      .filter((i) => i.activity_id === activity.id && !i.archived && i.goal)
      .map((i) => targetSummary(activity, i, data, day))
      .join("")
  );
}

export function logList(logs, data) {
  return logs.length
    ? `<div class="log-list">${[...logs]
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .map((log) => {
          const a = data.activities.find((a) => a.id === log.activity_id);
          const item = data.items.find((i) => i.id === log.item_id);
          return `<article class="log-row">${cardIcon(a)}<div class="grow"><strong>${h(item?.name ?? a.name)}</strong><p>${h(
            log.field_snapshot
              .filter(
                (f) =>
                  log.values[f.id] !== undefined && log.values[f.id] !== "",
              )
              .map(
                (f) =>
                  `${f.label}: ${typeof log.values[f.id] === "boolean" ? (log.values[f.id] ? "Yes" : "No") : log.values[f.id]}`,
              )
              .join(" · "),
          )}</p><small>${h(formatInTimeZone(log.occurred_at, data.settings.timezone, "MMM d, yyyy · HH:mm"))} · ${h(a.name)}</small></div><button class="icon-button" data-action="edit-log" data-id="${h(log.id)}" aria-label="Edit ${h(a.name)} entry">✎</button><button class="icon-button danger" data-action="delete-log" data-id="${h(log.id)}" aria-label="Delete ${h(a.name)} entry">×</button></article>`;
        })
        .join("")}</div>`
    : empty;
}
export function renderView(data, state, email, guestMode = defaultGuestMode) {
  const { page, day, filter, itemFilter, showArchived } = state;
  const today = localDay(new Date(), data.settings.timezone);
  const daily = onDay(data.logs, day, data.settings.timezone);
  const active = data.activities
    .filter((a) => !a.archived)
    .sort((a, b) => a.position - b.position);
  const detail = page.startsWith("activity/")
    ? data.activities.find((a) => a.id === page.slice(9))
    : undefined;
  const titles = {
    dashboard: "A new day, a little progress.",
    activities: "The things that matter.",
    history: "Your days, remembered.",
    reports: "See how far you’ve come.",
    settings: "Make this space yours.",
  };
  const dates = `<div class="date-nav">${button("‹", "previous-day")}<input aria-label="Journal date" type="date" data-change="day" value="${h(day)}">${button("›", "next-day")}${day !== today ? button("Today", "today") : ""}</div>`;
  const nav = [
    ["dashboard", "My day", "▦"],
    ["activities", "Activities", "◇"],
    ["history", "History", "◷"],
    ["reports", "Insights", "▥"],
    ["settings", "Settings", "⚙"],
  ];
  let content = "";
  if (page === "dashboard")
    content = `<section class="welcome-banner"><div><span class="eyebrow">A MOMENT FOR YOU</span><h2>Grow at your own pace.</h2><p>There’s no perfect day. Just the little things you choose to do.</p><span class="badge">✓ ${active.filter((a) => daily.some((l) => l.activity_id === a.id)).length} of ${active.length} activities recorded</span></div><div class="botanical" aria-hidden="true">❧</div></section><div class="section-heading"><h2>Your daily rituals</h2><a href="#activities">All activities ↗</a></div><section class="cards">${active.map((a) => `<article class="activity-card tone-${h(a.icon)}"><div class="row between">${cardIcon(a)}<a class="icon-button" href="#activity/${h(a.id)}" aria-label="View ${h(a.name)}">↗</a></div><a href="#activity/${h(a.id)}"><h3>${h(a.name)}</h3></a><div class="metric">${quickDoneValues(a) ? (completed(daily, a.id) ? "Done" : "Not yet") : a.quantity_field_id ? total(daily, a.id).toLocaleString() : daily.filter((l) => l.activity_id === a.id).length}<span>${quickDoneValues(a) ? "" : h(a.quantity_field_id ? a.unit : "entries")}</span></div><p>${completed(daily, a.id) ? "✓ Practice completed" : h(a.description)}</p>${cardTargets(a, data, day)}${activityAction(a, daily, "card-action")}</article>`).join("")}<button class="add-card" data-action="create-activity"><span>＋</span><strong>A new little ritual</strong><small>Create your own activity</small></button></section><div class="section-heading"><h2>Today’s moments</h2><a href="#history">View history ↗</a></div><section class="panel">${logList(daily.slice(0, 5), data)}</section>`;
  if (page === "activities")
    content = `<div class="section-heading"><label class="check"><input type="checkbox" data-change="archived" ${showArchived ? "checked" : ""}> Show archived</label>${button("＋ Create activity", "create-activity", "", "primary")}</div><section class="panel">${data.activities
      .filter((a) => showArchived || !a.archived)
      .sort((a, b) => a.position - b.position)
      .map(
        (a) =>
          `<div class="log-row">${cardIcon(a)}<a class="grow" href="#activity/${h(a.id)}"><strong>${h(a.name)}${a.archived ? " · Archived" : ""}</strong><p>${h(a.description)}</p></a>${button("Configure", "configure", a.id)}${button(a.archived ? "Restore" : "Archive", "archive-activity", a.id)}</div>`,
      )
      .join("")}</section>`;
  if (detail) {
    const a = detail;
    content = `<div class="detail-summary"><div class="panel stat"><small>SELECTED DAY</small><strong>${quickDoneValues(a) ? (completed(daily, a.id) ? "Done" : "Not yet") : a.quantity_field_id ? total(daily, a.id) : daily.filter((l) => l.activity_id === a.id).length} <span>${quickDoneValues(a) ? "" : h(a.quantity_field_id ? a.unit : "entries")}</span></strong>${completed(daily, a.id) ? "✓ Completed" : ""}</div><div class="panel stat"><small>ALL TIME</small><strong>${a.quantity_field_id ? total(data.logs, a.id) : data.logs.filter((l) => l.activity_id === a.id).length} <span>${h(a.quantity_field_id ? a.unit : "entries")}</span></strong></div></div>${targetSummary(a, null, data, day)}<div class="section-heading">${button("Configure activity", "configure", a.id)}${a.archived ? "<span>Archived</span>" : activityAction(a, daily, "primary")}</div>`;
    if (a.item_based)
      content += `<div class="section-heading"><h2>${a.seed_key === "reading" ? "Your bookshelf" : a.seed_key === "mantra" ? "Your mantras" : "Your items"}</h2>${button("＋ Add item", "add-item", a.id)}</div><section class="panel">${
        data.items
          .filter((i) => i.activity_id === a.id)
          .map(
            (i) =>
              `<article class="item-row"><div class="grow"><strong>${h(i.name)}</strong><p>${h([i.author, i.archived ? "Archived" : a.seed_key === "reading" ? i.status : "", i.description].filter(Boolean).join(" · "))}</p><small>${total(daily, a.id, i.id)} today · ${total(data.logs, a.id, i.id)} ${h(a.unit)} all time</small>${targetSummary(a, i, data, day)}</div>${!i.archived && !a.archived ? button("Log", "entry-item", i.id) : ""}${button("Edit", "edit-item", i.id)}${button(i.archived ? "Restore" : "Archive", "archive-item", i.id)}</article>`,
          )
          .join("") || empty
      }</section>`;
    content += `<div class="section-heading"><h2>Activity history</h2>${a.item_based ? select("Filter item", "item-filter", [["", "All items"], ...data.items.filter((i) => i.activity_id === a.id).map((i) => [i.id, i.name])], itemFilter, 'data-change="item-filter"') : ""}</div><p class="muted">All dates</p><section class="panel">${logList(
      data.logs.filter(
        (l) =>
          l.activity_id === a.id && (!itemFilter || l.item_id === itemFilter),
      ),
      data,
    )}</section>`;
  }
  if (page === "history")
    content = `<div class="section-heading"><h2>Your recorded moments</h2>${select("Activity", "activity-filter", [["", "All activities"], ...data.activities.map((a) => [a.id, a.name])], filter, 'data-change="filter"')}</div><section class="panel">${logList(
      daily.filter((l) => !filter || l.activity_id === filter),
      data,
    )}</section>`;
  if (page === "reports") content = reports(data, state);
  if (page === "settings")
    content = `<div class="settings-grid"><section class="panel padded"><h2>Your preferences</h2><p class="muted">${guestMode ? "Temporary guest journal ? stored only in this browser" : `Signed in as ${h(email)}`}</p><form data-form="settings">${input("Your name", "display_name", data.settings.display_name, "text", 'required maxlength="100"')}${input("Timezone (IANA name)", "timezone", data.settings.timezone, "text", 'required list="timezones"')}<datalist id="timezones">${["Asia/Kolkata", "UTC", "Europe/London", "America/New_York", "Asia/Singapore"].map((z) => `<option>${z}</option>`).join("")}</datalist>${select(
      "Appearance",
      "appearance",
      [
        ["system", "Follow device"],
        ["light", "Light"],
        ["dark", "Dark"],
      ],
      data.settings.appearance,
    )}<p role="alert" class="error"></p><button class="primary">Save preferences</button></form></section><section class="panel padded"><h2>Make it your own</h2><p>Create activities, configure entry fields, or update your yoga and meditation types.</p>${button("＋ Create activity", "create-activity")}<p><a href="#activities">Manage existing activities →</a></p></section></div>`;
  if (!content)
    content =
      '<div class="empty"><h2>Page not found</h2><a href="#dashboard">Return to My day</a></div>';
  return `<div class="app"><aside class="sidebar"><a class="brand" href="#dashboard"><span>❧</span> My Journey</a><div class="sidebar-caption">YOUR EVERYDAY, WITH INTENTION</div><nav>${nav.map(([id, label, symbol]) => `<a href="#${id}" class="${page === id || (id === "activities" && detail) ? "selected" : ""}"><span aria-hidden="true">${symbol}</span>${label}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="daily-note">❧<p>Little by little,<br>a little becomes a lot.</p></div><div class="profile"><span class="avatar">${h(data.settings.display_name[0])}</span><div class="grow"><strong>${h(data.settings.display_name)}</strong><small>One day at a time</small></div>${guestMode ? "" : button("Sign out", "signout")}</div></div></aside><div class="workspace"><header class="topbar"><span>YOUR PERSONAL JOURNAL</span><div><span class="private-dot"></span>${guestMode ? "Guest journal" : "Private space"} ${button("Refresh", "refresh")}${guestMode ? "" : button("Sign out", "signout", "", "mobile-signout")}</div></header><main>${guestMode ? `<p class="guest-notice" role="status">Temporary guest mode: entries are saved only in this browser, not Supabase. Clearing browser data removes them. Anyone using this browser profile can access them.</p>` : ""}<div class="error-banner" role="alert" hidden data-error></div><div class="page-heading"><div><span class="eyebrow">MAKE SPACE FOR YOURSELF</span><h1>${h(detail?.name ?? titles[page] ?? "Your journey")}</h1><p>${h(detail?.description ?? (page === "dashboard" ? formatInTimeZone(`${day}T12:00:00Z`, "UTC", "EEEE, MMMM d, yyyy") : "One small step at a time."))}</p></div>${page === "dashboard" || page === "history" || detail ? dates : ""}</div>${day !== today && (page === "dashboard" || detail || page === "history") ? `<p class="date-notice" role="status">Viewing ${h(day)} - entries will be saved for this date. ${button("Back to today", "today")}</p>` : ""}${content}<footer>Made for your everyday. ❧ One small step at a time.</footer></main></div></div>`;
}
function reports(data, state) {
  const period = state.period ?? 7,
    end = state.reportEnd ?? state.day,
    id = state.reportActivity || data.activities[0]?.id;
  const a = data.activities.find((a) => a.id === id);
  const days = Array.from({ length: period }, (_, i) =>
    moveDay(end, i - period + 1),
  );
  const logs = data.logs.filter((l) =>
    days.includes(localDay(l.occurred_at, data.settings.timezone)),
  );
  const chart = days.map((date) => ({
    date,
    value: a?.quantity_field_id
      ? total(onDay(logs, date, data.settings.timezone), id)
      : onDay(logs, date, data.settings.timezone).filter(
          (l) => l.activity_id === id,
        ).length,
  }));
  const maximum = Math.max(1, ...chart.map((p) => p.value));
  return `<div class="report-controls">${select(
    "Period",
    "period",
    [
      [7, "Weekly · 7 days"],
      [30, "Monthly · 30 days"],
    ],
    period,
    'data-change="period"',
  )}${input("Ending on", "report-end", end, "date", 'data-change="report-end"')}${select(
    "Activity",
    "report-activity",
    data.activities.map((a) => [a.id, a.name]),
    id,
    'data-change="report-activity"',
  )}</div><section class="panel padded"><h2>${h(a?.name ?? "Activity")} over time</h2><p>${h(days[0])} – ${h(end)} · ${h(a?.quantity_field_id ? a.unit : "entries")}</p><div class="native-chart" role="img" aria-label="Daily totals; exact values in the table below">${chart.map((p) => `<div class="chart-column" title="${p.date}: ${p.value}"><span style="height:${Math.max(0, (p.value / maximum) * 100)}%"></span><small>${p.date.slice(8)}</small></div>`).join("")}</div><details><summary>View chart data</summary><table><thead><tr><th>Date</th><th>Total</th></tr></thead><tbody>${chart.map((p) => `<tr><td>${p.date}</td><td>${p.value}</td></tr>`).join("")}</tbody></table></details></section><div class="section-heading"><h2>Your progress, together</h2></div><section class="panel table-scroll"><table><thead><tr><th>Activity</th><th>This period</th><th>Active days</th><th>All time</th></tr></thead><tbody>${data.activities.map((a) => `<tr><td><a href="#activity/${a.id}">${h(a.name)}</a><small>${h(a.unit)}</small></td><td>${a.quantity_field_id ? total(logs, a.id) : logs.filter((l) => l.activity_id === a.id).length}</td><td>${new Set(logs.filter((l) => l.activity_id === a.id).map((l) => localDay(l.occurred_at, data.settings.timezone))).size} / ${period}</td><td>${a.quantity_field_id ? total(data.logs, a.id) : data.logs.filter((l) => l.activity_id === a.id).length}</td></tr>`).join("")}</tbody></table></section>`;
}
export function authView(mode) {
  return `<main class="auth-page"><section class="auth-intro"><div class="brand">❧ My Journey</div><span class="eyebrow">SMALL STEPS. MEANINGFUL DAYS.</span><h1>A little progress,<br>every day.</h1><p>A quiet place for your everyday rituals.<br>Drink water. Turn a page. Find your balance.</p><div class="auth-art" aria-hidden="true">✧ ❧ ◌</div><small>Your journey is yours alone.</small></section><section class="auth-form"><span class="eyebrow">WELCOME TO YOUR SPACE</span><h2>${mode === "recovery" ? "Choose a new password" : mode === "reset" ? "A fresh start" : "Welcome back"}</h2><p class="muted">Make time for the things that matter to you.</p><form data-form="auth">${mode !== "recovery" ? input("Email address", "email", "", "email", 'required autocomplete="email"') : ""}${mode !== "reset" ? input("Password", "password", "", "password", `required autocomplete="${mode === "recovery" ? "new-password" : "current-password"}" ${mode === "recovery" ? 'minlength="12"' : ""}`) : ""}<button class="primary wide">${mode === "recovery" ? "Update password" : mode === "reset" ? "Send recovery link" : "Sign in to My Journey"}</button><p role="status" data-auth-message></p></form>${mode !== "recovery" ? button(mode === "reset" ? "Back to sign in" : "Forgot your password?", "auth-mode", "", "text-button") : ""}<p class="small muted">A private journal. Accounts are created by the project owner.</p></section></main>`;
}
