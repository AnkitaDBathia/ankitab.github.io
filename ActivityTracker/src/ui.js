// All values interpolated into markup must pass through escapeHTML.
export const escapeHTML = (value = "") =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const h = escapeHTML;
export const symbols = {
  mantra: "📿",
  lotus: "🪷",
  diya: "🪔",
  om: "🕉️",
  peace: "🕊️",
  forgiveness: "🤍",
  kindness: "💗",
  reflection: "🪞",
  journal: "📓",
  sunrise: "🌅",
  yoga: "🧘",
  exercise: "🏋️",
  running: "🏃",
  cycling: "🚴",
  swimming: "🏊",
  sleep: "🛌",
  food: "🥗",
  fruit: "🍎",
  cooking: "🍳",
  medicine: "💊",
  music: "🎵",
  art: "🎨",
  study: "🎓",
  work: "💼",
  prayer: "🙏",
  gardening: "🌱",
  cleaning: "🧹",
  money: "💰",
  target: "🎯",
  gratitude: "🌻",
  water: "◉",
  book: "▤",
  sun: "☀",
  leaf: "❧",
  moon: "☾",
  walk: "↟",
  heart: "♡",
  pencil: "✎",
  sparkles: "✧",
};
export const icon = (name) =>
  `<span aria-hidden="true">${symbols[name] || symbols.sparkles}</span>`;
export const button = (label, action, id = "", cls = "") =>
  `<button type="button" class="${h(cls)}" data-action="${h(action)}" data-id="${h(id)}">${h(label)}</button>`;
export const options = (values, selected) =>
  values
    .map((v) => {
      const [value, label] = Array.isArray(v) ? v : [v, v];
      return `<option value="${h(value)}" ${String(value) === String(selected) ? "selected" : ""}>${h(label)}</option>`;
    })
    .join("");
export const input = (label, name, value = "", type = "text", attrs = "") =>
  `<label class="field">${h(label)}<input name="${h(name)}" type="${h(type)}" value="${h(value)}" ${attrs}></label>`;
export const select = (label, name, values, value = "", attrs = "") =>
  `<label class="field">${h(label)}<select name="${h(name)}" ${attrs}>${options(values, value)}</select></label>`;
export const textarea = (label, name, value = "") =>
  `<label class="field">${h(label)}<textarea name="${h(name)}" maxlength="10000">${h(value)}</textarea></label>`;
export const checkbox = (label, name, checked) =>
  `<label class="check"><input name="${h(name)}" type="checkbox" ${checked ? "checked" : ""}>${h(label)}</label>`;
export const valueOf = (form, name) =>
  form.elements.namedItem(name)?.value ?? "";
export const checked = (form, name) =>
  form.elements.namedItem(name)?.checked ?? false;
export const numberOrNull = (v) => (v === "" ? null : Number(v));
export function fieldControl(f, value) {
  const label = f.label + (f.required ? " *" : "");
  const name = `value-${f.id}`;
  if (f.type === "boolean") return checkbox(label, name, value === true);
  if (f.type === "select")
    return select(
      label,
      name,
      [["", "Choose…"], ...f.options],
      value,
      f.required ? "required" : "",
    );
  if (f.type === "multiline")
    return `<label class="field">${h(label)}<textarea name="${h(name)}" maxlength="10000" ${f.required ? "required" : ""}>${h(value)}</textarea></label>`;
  return input(
    label,
    name,
    value ?? "",
    ["number", "duration"].includes(f.type)
      ? "number"
      : f.type === "date"
        ? "date"
        : "text",
    `${f.required ? "required" : ""} step="any" ${f.min !== null ? `min="${h(f.min)}"` : ""} ${f.max !== null ? `max="${h(f.max)}"` : ""}`,
  );
}
export function readValues(form, fields) {
  return Object.fromEntries(
    fields.map((f) => {
      const raw = valueOf(form, `value-${f.id}`);
      return [
        f.id,
        f.type === "boolean"
          ? checked(form, `value-${f.id}`)
          : ["number", "duration"].includes(f.type) && raw !== ""
            ? Number(raw)
            : raw,
      ];
    }),
  );
}
export function sheet(title, content, onSave) {
  const previous = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "sheet";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<div class="sheet-content"><header><h2>${h(title)}</h2><button type="button" data-close aria-label="Close dialog">×</button></header><form>${content}<p class="error" role="alert"></p></form></div>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  let busy = false;
  const close = () => {
    if (busy) return;
    dialog.close();
    dialog.remove();
    if (previous?.isConnected) previous.focus();
  };
  dialog.querySelector("[data-close]").onclick = close;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const buttons = [...dialog.querySelectorAll("button")];
    const states = buttons.map((b) => b.disabled);
    buttons.forEach((b) => (b.disabled = true));
    const submitter =
      e.submitter ??
      form.querySelector('button[type="submit"], button.primary');
    const label = submitter?.textContent;
    if (submitter) submitter.textContent = "Saving...";
    form.querySelector(".error").textContent = "";
    try {
      await onSave(form, e.submitter);
      busy = false;
      close();
    } catch (error) {
      form.querySelector(".error").textContent = error.message;
    } finally {
      busy = false;
      buttons.forEach((b, i) => (b.disabled = states[i]));
      if (submitter) submitter.textContent = label;
    }
  });
  dialog.showModal();
  return { form, dialog, close };
}
export function notify(message, undo) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  if (undo) {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = "Undo";
    action.onclick = async () => {
      action.disabled = true;
      action.textContent = "Undoing...";
      try {
        await undo();
        toast.remove();
      } catch {
        action.disabled = false;
        action.textContent = "Retry undo";
        toast.firstChild.textContent = "Could not undo. ";
      }
    };
    toast.append(" ", action);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    dismiss.onclick = () => toast.remove();
    toast.append(dismiss);
  }
  document.body.append(toast);
  if (!undo) setTimeout(() => toast.remove(), 4000);
}
