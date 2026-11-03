import { typeOf, outcomeLabel, habitDay, configurationAt, dayConfiguration, measurementTotals, scheduled } from "./habits.js";
import { boundaryCard, consistencyView } from "./habit-ui.js";
import { supportsMood, favouritesFirst, searchLogs } from "./journal.js";
import {
  completionOnly,
  quickDoneValues,
  latestCompletion,
  goalProgress,
  quickAmounts,
} from "./tracking.js";
import { guestMode as defaultGuestMode } from "./mode.js";
import { formatInTimeZone } from "date-fns-tz";
import { completed, localDay, moveDay, onDay, total } from "./lib.js";
import { h, icon, button, input, select } from "./ui.js";
const empty =
  '<div class="empty"><h3>A fresh page in your journey</h3><p>No entries here yet. Every small step counts.</p></div>';
const cardIcon = (a) =>
  `<span class="activity-icon ${h(a.icon)}">${icon(a.icon)}</span>`;

export function activityAction(activity, daily, cls = "primary", compact = false) {
  if(typeOf(activity)!=="build") return button("Record outcome", "entry", activity.id, cls);
  if (quickDoneValues(activity)) {
    const done = completed(daily, activity.id);
    const latest = latestCompletion(daily, activity.id);
    if (compact) {
      const extra = `${latest?.id && supportsMood(activity) ? button("Mood", "edit-log", latest.id, "text-button") : ""}${done ? button("+ Log again", "entry", activity.id, "text-button") : completionOnly(activity) ? "" : button("Add details", "entry", activity.id, "text-button")}`;
      return `<div class="row-actions"><button type="button" class="${h(cls)} ${done ? "is-done" : ""}" data-action="mark-done" data-id="${h(activity.id)}" ${done ? "disabled" : ""}>${done ? "Done" : "Mark done"}</button>${latest?.id ? button("Undo", "undo-log", latest.id, "text-button") : ""}${extra ? `<details class="row-more"><summary aria-label="More actions for ${h(activity.name)}">More</summary><div>${extra}</div></details>` : ""}</div>`;
    }
    return `<div class="completion-actions"><button type="button" class="${h(cls)} ${done ? "is-done" : ""}" data-action="mark-done" data-id="${h(activity.id)}" ${done ? "disabled" : ""}>${done ? "Done" : "Mark done"}</button>${latest?.id && supportsMood(activity) ? button("Mood", "edit-log", latest.id, "text-button") : ""}${latest?.id ? button("Undo", "undo-log", latest.id, "text-button") : ""}${done ? button("+ Log again", "entry", activity.id, "text-button") : completionOnly(activity) ? "" : button("Add details", "entry", activity.id, "text-button")}</div>`;
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

function favouriteButton(item) {
  return `<button type="button" class="text-button" data-action="favourite-item" data-id="${h(item.id)}" aria-pressed="${!!item.favourite}" aria-label="${item.favourite ? "Unpin" : "Pin"} ${h(item.name)}">${item.favourite ? "&#9733;" : "&#9734;"}</button>`;
}
export function targetSummary(activity, item, data, day, showLog = false) {
  const canLog=!activity.archived && !item?.archived;
  if(Array.isArray(data.revisions)) {
    const cfg=dayConfiguration(data,activity,day);
    if(!cfg) return item||activity.daily_goal?'<small class="muted">Historical target unavailable</small>':'';
    activity={...activity,...cfg,archived:activity.archived};
    if(item) {
      const previous=cfg.items?.find(i=>i.id===item.id);
      if(!previous) return '';
      item={...item,...previous,archived:!canLog};
    }
  }
  const progress = goalProgress(
    activity,
    item,
    data.logs,
    day,
    data.settings.timezone,
  );
  if (!progress) return "";
  return `<div class="target-summary"><small>${showLog && item && activity.seed_key === "mantra" ? favouriteButton(item) : ""}${item ? `${h(item.name)} - ` : ""}${progress.daily ? "Daily" : "Overall"} target: ${progress.value.toLocaleString()} / ${progress.goal.toLocaleString()} ${h(activity.quantity_field_id ? activity.unit : "entries")}</small><div class="target-action"><strong>${h(progress.text)}</strong>${showLog && item && !item.archived && !activity.archived ? `<div class="quick-amounts">${quickAmounts(progress.goal, progress.remaining).map(amount => `<button type="button" class="target-log" data-action="increment-item" data-id="${h(item.id)}" data-amount="${amount}" aria-label="Add ${amount} to ${h(item.name)}">+${amount}${amount === progress.remaining ? " to finish" : ""}</button>`).join("")}</div>` : ""}</div><progress aria-label="${h(item?.name ?? activity.name)} target" max="${progress.goal}" value="${Math.max(0, Math.min(progress.goal, progress.value))}"></progress></div>`;
}
function cardTargets(activity, data, day) {
  return (
    targetSummary(activity, null, data, day) +
    favouritesFirst(data.items)
      .filter((i) => i.activity_id === activity.id && !i.archived && i.goal)
      .map((i) => targetSummary(activity, i, data, day, true))
      .join("")
  );
}

function dashboard(data, state, active, daily) {
  const { day } = state;
  const panel = (key, title, count, body, open = true) => `<details class="habit-panel" data-panel="${h(key)}" ${(state.panels?.[key] ?? open) ? 'open' : ''}><summary><strong>${h(title)}</strong><span>${h(count)}</span></summary>${body}</details>`;
  const buildRow = a => {
    const done = !!quickDoneValues(a), count = daily.filter(l=>l.activity_id===a.id).length;
    const metric = done ? (completed(daily,a.id)?'Done':'Not yet') : `${a.quantity_field_id?total(daily,a.id):count} ${a.quantity_field_id?a.unit:'entries'}`;
    const targets = cardTargets(a,data,day);
    const heading = `<div class="habit-row-heading">${cardIcon(a)}<div><a href="#activity/${h(a.id)}"><strong>${h(a.name)}</strong></a><small>${h(metric)}${!scheduled(configurationAt(data,a,day)??a,day)?' · Not scheduled':''}</small></div></div>`;
    const actions = activityAction(a,daily,'card-action',true);
    if (a.item_based && targets) return `<article class="habit-row item-habit"><div class="habit-row-top">${heading}${actions}</div>${panel(`items-${a.id}`,a.seed_key==='mantra'?'Mantras and quick add':'Items and targets',`${data.items.filter(i=>i.activity_id===a.id&&!i.archived&&i.goal).length} targets`, `<div class="item-target-grid">${targets}</div>`)}</article>`;
    return `<article class="habit-row"><div class="habit-row-top">${heading}${actions}</div>${targets}</article>`;
  };
  const labels={build:'Build · Positive habits',maintain:'Maintain · Healthy boundaries',replace:'Replace · Healthier choices'};
  return `<div class="dashboard-toolbar"><span><strong>${active.filter(a=>daily.some(l=>l.activity_id===a.id)).length} / ${active.length}</strong> habits recorded</span><div><a href="#activities">Manage habits</a>${button('+ Habit','create-activity')}</div></div>${Object.entries(labels).filter(([type])=>active.some(a=>typeOf(a)===type)).map(([type,label])=>{
    const habits=active.filter(a=>typeOf(a)===type);
    return panel(type,label,`${habits.length} habits`, `<div class="${type==='build'?'habit-rows':'cards'}">${habits.map(a=>type==='build'?buildRow(a):boundaryCard(a,data,day)).join('')}</div>`);
  }).join('')}${!active.length?'<p class="muted">Create a habit to get started.</p>':''}${panel('recent','Recent entries',daily.length,`<a href="#history">View history</a><section class="panel">${logList(daily.slice(0,5),data)}</section>`,false)}`;
}

export function logList(logs, data) {
  return logs.length
    ? `<div class="log-list">${[...logs]
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .map((log) => {
          const a = data.activities.find((a) => a.id === log.activity_id);
          const item = data.items.find((i) => i.id === log.item_id);
          return `<article class="log-row">${cardIcon(a)}<div class="grow"><strong>${h(item?.name ?? a.name)}</strong><p>${h(
            [...(log.field_snapshot ?? [])]
              .filter(
                (f) =>
                  log.values[f.id] !== undefined && log.values[f.id] !== "",
              )
              .map(
                (f) =>
                  `${f.label}: ${typeof log.values[f.id] === "boolean" ? (log.values[f.id] ? "Yes" : "No") : log.values[f.id]}`,
              )
              .join(" · "),
          )}</p>${log.outcome ? `<p><strong>${h(outcomeLabel(log.outcome))}</strong>${log.habit_note ? ` - ${h(log.habit_note)}` : ""}</p>` : ""}${log.mood || log.mood_note ? `<p>${h([log.mood,log.mood_note].filter(Boolean).join(" - "))}</p>` : ""}<small>${h(formatInTimeZone(log.occurred_at, log.habit_timezone ?? data.settings.timezone, "MMM d, yyyy · HH:mm"))} · ${h(a.name)}</small></div><button class="icon-button" data-action="edit-log" data-id="${h(log.id)}" aria-label="Edit ${h(a.name)} entry">✎</button><button class="icon-button danger" data-action="delete-log" data-id="${h(log.id)}" aria-label="Delete ${h(a.name)} entry">×</button></article>`;
        })
        .join("")}</div>`
    : empty;
}
export function renderView(data, state, email, guestMode = defaultGuestMode) {
  const { page, day, filter, itemFilter, showArchived } = state;
  const today = localDay(new Date(), data.settings.timezone);
  const daily = data.logs.filter(l=>habitDay(l,data.settings.timezone)===day);
  const active = data.activities
    .filter((a) => !a.archived && a.show_on_dashboard !== false)
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
  if (page === "dashboard") content = dashboard(data, state, active, daily);
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
    if(typeOf(a)!=="build") content = `${boundaryCard(a,data,day)}${button("Configure habit","configure",a.id)}`;
    if (a.item_based)
      content += `<div class="section-heading"><h2>${a.seed_key === "reading" ? "Your bookshelf" : a.seed_key === "mantra" ? "Your mantras" : "Your items"}</h2>${button("＋ Add item", "add-item", a.id)}</div><section class="panel">${
        favouritesFirst(data.items)
          .filter((i) => i.activity_id === a.id)
          .map(
            (i) =>
              `<article class="item-row"><div class="grow">${a.seed_key === "mantra" ? favouriteButton(i) : ""}<strong>${h(i.name)}</strong><p>${h([i.author, i.archived ? "Archived" : a.seed_key === "reading" ? i.status : "", i.description].filter(Boolean).join(" · "))}</p><small>${total(daily, a.id, i.id)} today · ${total(data.logs, a.id, i.id)} ${h(a.unit)} all time</small>${targetSummary(a, i, data, day)}</div>${!i.archived && !a.archived ? button("Log", "entry-item", i.id) : ""}${button("Edit", "edit-item", i.id)}${button(i.archived ? "Restore" : "Archive", "archive-item", i.id)}</article>`,
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
    content = `<div class="section-heading"><h2>Your recorded moments</h2>${button(state.searchOpen ? "Close search" : "Search", "toggle-search")}${select("Activity", "activity-filter", [["", "All activities"], ...data.activities.map((a) => [a.id, a.name])], filter, 'data-change="filter"')}</div>${state.searchOpen ? `<form data-form="history-search" class="history-search"><input type="search" name="query" aria-label="Search history" placeholder="Activity, mantra, book or notes" value="${h(state.searchQuery ?? "")}"><button type="submit">Search all dates</button></form><p class="muted">${state.searchQuery ? "Results across all dates" : "Enter a search to look across all dates"}</p>` : ""}<section class="panel">${logList(
      (state.searchOpen && state.searchQuery ? searchLogs(data.logs, data, state.searchQuery) : daily).filter((l) => !filter || l.activity_id === filter),
      data,
    )}</section>`;
  if (page === "reports") content = reports(data, state);
  if (page === "settings")
    content = `<div class="settings-grid"><section class="panel padded"><h2>Your preferences</h2><p class="muted">${guestMode ? "Temporary guest journal - stored only in this browser" : `Signed in as ${h(email)}`}</p><form data-form="settings">${input("Your name", "display_name", data.settings.display_name, "text", 'required maxlength="100"')}${input("Timezone (IANA name)", "timezone", data.settings.timezone, "text", 'required list="timezones"')}<datalist id="timezones">${["Asia/Kolkata", "UTC", "Europe/London", "America/New_York", "Asia/Singapore"].map((z) => `<option>${z}</option>`).join("")}</datalist>${select(
      "Appearance",
      "appearance",
      [
        ["system", "Follow device"],
        ["light", "Light"],
        ["dark", "Dark"],
      ],
      data.settings.appearance,
    )}<p role="alert" class="error"></p><button class="primary">Save preferences</button></form></section><section class="panel padded"><h2>Make it your own</h2><p>Create activities, configure entry fields, or update your yoga and meditation types.</p>${button("＋ Create activity", "create-activity")}<p><a href="#activities">Manage existing activities →</a></p></section></div>`;
  if (page === "settings" && !guestMode && data.canCreateAccounts)
    content += `<section class="panel padded"><h2>Accounts</h2><p>Create a private account for someone you choose. A recovery email is optional.</p>${button("Create account", "create-account", "", "primary")}</section>`;
  if (!content)
    content =
      '<div class="empty"><h2>Page not found</h2><a href="#dashboard">Return to My day</a></div>';
  return `<div class="app"><aside class="sidebar"><a class="brand" href="#dashboard"><span>❧</span> My Journey</a><div class="sidebar-caption">YOUR EVERYDAY, WITH INTENTION</div><nav>${nav.map(([id, label, symbol]) => `<a href="#${id}" class="${page === id || (id === "activities" && detail) ? "selected" : ""}"><span aria-hidden="true">${symbol}</span>${label}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="daily-note">❧<p>Little by little,<br>a little becomes a lot.</p></div><div class="profile"><span class="avatar">${h(data.settings.display_name[0])}</span><div class="grow"><strong>${h(data.settings.display_name)}</strong><small>One day at a time</small></div>${guestMode ? "" : button("Sign out", "signout")}</div></div></aside><div class="workspace"><header class="topbar"><span>YOUR PERSONAL JOURNAL</span><div><span class="private-dot"></span>${guestMode ? "Guest journal" : "Private space"} ${button("Refresh", "refresh")}${guestMode ? "" : button("Sign out", "signout", "", "mobile-signout")}</div></header><main class="${page === "dashboard" ? "dashboard-main" : ""}">${guestMode ? `<p class="guest-notice" role="status">Temporary guest mode: entries are saved only in this browser, not Supabase. Clearing browser data removes them. Anyone using this browser profile can access them.</p>` : ""}<div class="error-banner" role="alert" hidden data-error></div><div class="page-heading"><div><span class="eyebrow">MAKE SPACE FOR YOURSELF</span><h1>${h(detail?.name ?? titles[page] ?? "Your journey")}</h1><p>${h(detail?.description ?? (page === "dashboard" ? formatInTimeZone(`${day}T12:00:00Z`, "UTC", "EEEE, MMMM d, yyyy") : "One small step at a time."))}</p></div>${page === "dashboard" || page === "history" || detail ? dates : ""}</div>${day !== today && (page === "dashboard" || detail || page === "history") ? `<p class="date-notice" role="status">Viewing ${h(day)} - entries will be saved for this date. ${button("Back to today", "today")}</p>` : ""}${content}<footer>Made for your everyday. ❧ One small step at a time.</footer></main></div></div>`;
}
function reports(data, state) {
  const period = state.period ?? 7,
    end = [state.reportEnd ?? state.day,localDay(new Date(),data.settings.timezone)].sort()[0],
    id = state.reportActivity || data.activities[0]?.id;
  const a = data.activities.find((a) => a.id === id);
  const length=period===0?Number(end.slice(8)):period;
  const days = Array.from({ length }, (_, i) =>
    moveDay(end, i - length + 1),
  );
  const logs = data.logs.filter((l) =>
    days.includes(habitDay(l, data.settings.timezone)),
  );
  const measured=a?measurementTotals(logs,a):[];
  const useQuantity=a?.quantity_field_id&&measured.length<=1;
  const unit=typeOf(a)==='maintain'?'achieved boundaries':typeOf(a)==='replace'?'successful replacements':useQuantity?(measured[0]?.unit??a.unit):'recorded entries';
  const chart = days.map((date) => ({
    date,
    value: a && typeOf(a)!=="build" ? onDay(logs,date,data.settings.timezone).filter(l=>l.activity_id===id&&["achieved","replaced"].includes(l.outcome)).length : useQuantity
      ? total(onDay(logs, date, data.settings.timezone), id)
      : onDay(logs, date, data.settings.timezone).filter(
          (l) => l.activity_id === id,
        ).length,
  }));
  const maximum = Math.max(1, ...chart.map((p) => p.value));
  function actual(rows,activity) {
    const own=rows.filter(l=>l.activity_id===activity.id);
    const amounts=measurementTotals(own,activity).map(m=>`${m.value} ${m.unit}`);
    if(typeOf(activity)==='maintain') return `${own.filter(l=>l.outcome==='achieved').length} achieved; ${own.filter(l=>l.outcome==='not_achieved').length} not achieved; ${own.filter(l=>l.outcome==='not_applicable').length} not applicable`;
    if(typeOf(activity)==='replace') amounts.unshift(`${own.filter(l=>l.outcome==='replaced').length} replacements; ${own.filter(l=>l.outcome==='not_replaced').length} incomplete; ${own.filter(l=>l.outcome==='not_applicable').length} not applicable`);
    return amounts.join(' / ')||`${own.length} entries`;
  }
  return `<div class="report-controls">${select(
    "Period",
    "period",
    [
      [7, "Last 7 days"],
      [30, "Last 30 days"],
      [0, "Calendar month to selected date"],
    ],
    period,
    'data-change="period"',
  )}${input("Ending on", "report-end", end, "date", 'data-change="report-end"')}${select(
    "Activity",
    "report-activity",
    data.activities.map((a) => [a.id, a.name]),
    id,
    'data-change="report-activity"',
  )}</div>${consistencyView(data,days)}<section class="panel padded"><h2>${h(a?.name ?? "Activity")} over time</h2><p>${h(days[0])} – ${h(end)} · ${h(unit)}</p><div class="native-chart" role="img" aria-label="Daily totals; exact values in the table below">${chart.map((p) => `<div class="chart-column" title="${p.date}: ${p.value}"><span style="height:${Math.max(0, (p.value / maximum) * 100)}%"></span><small>${p.date.slice(8)}</small></div>`).join("")}</div><details><summary>View chart data</summary><table><thead><tr><th>Date</th><th>${h(unit)}</th></tr></thead><tbody>${chart.map((p) => `<tr><td>${p.date}</td><td>${p.value}</td></tr>`).join("")}</tbody></table></details></section><div class="section-heading"><h2>Actual records</h2></div><section class="panel table-scroll"><table><thead><tr><th>Habit</th><th>This period</th><th>All time</th></tr></thead><tbody>${data.activities.map((a) => `<tr><td><a href="#activity/${h(a.id)}">${h(a.name)}</a></td><td>${h(actual(logs,a))}</td><td>${h(actual(data.logs,a))}</td></tr>`).join("")}</tbody></table></section><div class="section-heading"><h2>Optional weekly reflection</h2>${button("Reflect on this week","reflection")}</div>`;
}
export function authView(mode) {
  return `<main class="auth-page"><section class="auth-intro"><div class="brand">❧ My Journey</div><span class="eyebrow">SMALL STEPS. MEANINGFUL DAYS.</span><h1>A little progress,<br>every day.</h1><p>A quiet place for your everyday rituals.<br>Drink water. Turn a page. Find your balance.</p><div class="auth-art" aria-hidden="true">✧ ❧ ◌</div><small>Your journey is yours alone.</small></section><section class="auth-form"><span class="eyebrow">WELCOME TO YOUR SPACE</span><h2>${mode === "recovery" ? "Choose a new password" : mode === "reset" ? "A fresh start" : "Welcome back"}</h2><p class="muted">Make time for the things that matter to you.</p><form data-form="auth">${mode !== "recovery" ? input(mode === "reset" ? "Recovery email" : "Username or email", "email", "", mode === "reset" ? "email" : "text", mode === "reset" ? 'required autocomplete="email"' : 'required autocomplete="username" autocapitalize="none" spellcheck="false"') : ""}${mode !== "reset" ? input("Password", "password", "", "password", `required autocomplete="${mode === "recovery" ? "new-password" : "current-password"}" ${mode === "recovery" ? 'minlength="12"' : ""}`) : ""}<button class="primary wide">${mode === "recovery" ? "Update password" : mode === "reset" ? "Send recovery link" : "Sign in to My Journey"}</button><p role="status" data-auth-message></p></form>${mode !== "recovery" ? button(mode === "reset" ? "Back to sign in" : "Forgot your password?", "auth-mode", "", "text-button") : ""}<p class="small muted">Accounts are created by the administrator. Email is optional; without one, ask the administrator to reset a forgotten password.</p></section></main>`;
}
