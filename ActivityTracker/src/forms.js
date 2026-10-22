import { formatInTimeZone } from "date-fns-tz";
import {
  occurrence,
  onDay,
  total,
  validateActivity,
  validateFields,
} from "./lib.js";
import {
  h,
  input,
  textarea,
  select,
  checkbox,
  options,
  fieldControl,
  readValues,
  valueOf,
  checked,
  numberOrNull,
  sheet,
  button,
  symbols,
} from "./ui.js";

export function entryForm(
  activity,
  items,
  logs,
  day,
  timezone,
  save,
  edit,
  initialItem,
) {
  const fields = edit?.field_snapshot ?? activity.fields;
  const values =
    edit?.values ??
    Object.fromEntries(
      fields
        .filter((f) => f.default_value !== null)
        .map((f) => [f.id, f.default_value]),
    );
  const date = edit
    ? formatInTimeZone(edit.occurred_at, timezone, "yyyy-MM-dd")
    : day;
  const item =
    edit?.item_id ?? initialItem ?? items.find((i) => !i.archived)?.id ?? "";
  const id = crypto.randomUUID();
  const { form } = sheet(
    edit ? "Edit entry" : `Log ${activity.name}`,
    `
 <p class="muted" data-total></p>
 ${activity.item_based ? select("Item", "item", [["", "Choose an item…"], ...items.filter((i) => !i.archived || i.id === edit?.item_id).map((i) => [i.id, i.name])], item, edit ? "disabled" : "required") : ""}
 ${!edit && activity.quantity_field_id ? `<div class="presets">${activity.presets.map((p) => `<button type="submit" data-preset="${p}" formnovalidate>+${p}</button>`).join("")}</div>` : ""}
 ${fields.map((f) => fieldControl(f, values[f.id])).join("")}
 <div class="two">${input("Date", "date", date, "date", "required")}${input(`Time (${timezone})`, "time", formatInTimeZone(edit?.occurred_at ?? new Date(), timezone, "HH:mm"), "time", "required")}</div>
 <button class="primary wide" type="submit">${edit ? "Save changes" : "Save entry"}</button>`,
    async (form, submitter) => {
      if (submitter?.dataset.preset) {
        form.elements.namedItem(`value-${activity.quantity_field_id}`).value =
          submitter.dataset.preset;
      }
      if (!form.reportValidity())
        throw new Error("Please complete the required fields.");
      const values = readValues(form, fields);
      const errors = validateFields(fields, values);
      if (Object.keys(errors).length)
        throw new Error(Object.values(errors).join(" "));
      await save(
        {
          ...(!edit
            ? {
                id,
                activity_id: activity.id,
                item_id: activity.item_based ? valueOf(form, "item") : null,
              }
            : {}),
          values,
          occurred_at: occurrence(
            valueOf(form, "date"),
            valueOf(form, "time"),
            timezone,
          ),
        },
        edit?.id,
      );
    },
  );
  const updateTotal = () => {
    form.querySelector("[data-total]").textContent =
      `${total(onDay(logs, valueOf(form, "date"), timezone), activity.id, activity.item_based ? valueOf(form, "item") : undefined)} ${activity.unit} on this day`;
  };
  form.addEventListener("change", updateTotal);
  updateTotal();
}

export function itemForm(activity, save, item) {
  sheet(
    `${item ? "Edit" : "Add"} ${activity.seed_key === "reading" ? "book" : activity.seed_key === "mantra" ? "mantra" : "item"}`,
    `
 ${input("Name", "name", item?.name, "text", 'required maxlength="200"')}
 ${activity.seed_key === "reading" ? input("Author", "author", item?.author) + select("Status", "status", ["Not Started", "Reading", "Completed"], item?.status ?? "Not Started") : ""}
 ${textarea("Description", "description", item?.description)}
 ${input(`Goal / target (${activity.unit})`, "goal", item?.goal, "number", 'min="0.01" step="any"')}
 <button class="primary wide">Save item</button>`,
    async (form) =>
      save(
        {
          activity_id: activity.id,
          name: valueOf(form, "name").trim(),
          author: valueOf(form, "author"),
          description: valueOf(form, "description"),
          status: valueOf(form, "status") || "Not Started",
          goal: numberOrNull(valueOf(form, "goal")),
        },
        item?.id,
      ),
  );
}

const blankField = () => ({
  id: crypto.randomUUID(),
  label: "",
  type: "number",
  required: false,
  default_value: null,
  position: 0,
  options: [],
  min: null,
  max: null,
});
export function activityForm(save, activity) {
  const fields = structuredClone(activity?.fields ?? [blankField()]);
  const { form } = sheet(
    activity ? "Configure activity" : "Create activity",
    `
 ${input("Activity name", "name", activity?.name, "text", 'required maxlength="100"')}${textarea("Description", "description", activity?.description)}
 <div class="two">${select("Icon", "icon", Object.keys(symbols), activity?.icon ?? "sparkles")}${input("Unit (e.g. steps)", "unit", activity?.unit)}</div>
 <div class="two">${input("Display order", "position", activity?.position ?? 5, "number", "required")}${input("Quick presets (comma separated)", "presets", activity?.presets.join(", ") ?? "1, 5, 10")}</div>
 ${checkbox("Uses individual items (books, mantras, etc.)", "item_based", activity?.item_based)}
 <h3>Entry fields</h3><p class="muted">Changes apply to new entries. Historical records keep their original fields. Remove and recreate a field to change its type.</p>
 <div data-fields></div>${button("+ Add field", "add-field")}
 ${select("Field to total in summaries", "quantity", [], activity?.quantity_field_id)}
 <button class="primary wide" type="submit">Save activity</button>`,
    async (form) => {
      readFields();
      const row = {
        name: valueOf(form, "name").trim(),
        description: valueOf(form, "description"),
        icon: valueOf(form, "icon"),
        unit: valueOf(form, "unit"),
        position: Number(valueOf(form, "position")),
        item_based: checked(form, "item_based"),
        fields: fields.map((f, i) => ({ ...f, position: i })),
        presets: valueOf(form, "presets").trim()
          ? valueOf(form, "presets").split(",").map(Number)
          : [],
        quantity_field_id: valueOf(form, "quantity") || null,
      };
      validateActivity(row);
      await save(row, activity?.id);
    },
  );
  function readFields() {
    for (const f of fields) {
      const prefix = `config-${f.id}-`;
      const type = valueOf(form, prefix + "type");
      const raw = valueOf(form, prefix + "default");
      Object.assign(f, {
        label: valueOf(form, prefix + "label"),
        type,
        required: checked(form, prefix + "required"),
        options:
          type === "select"
            ? valueOf(form, prefix + "options").split("\n")
            : [],
        min: ["number", "duration"].includes(type)
          ? numberOrNull(valueOf(form, prefix + "min"))
          : null,
        max: ["number", "duration"].includes(type)
          ? numberOrNull(valueOf(form, prefix + "max"))
          : null,
        default_value:
          raw === ""
            ? null
            : type === "boolean"
              ? raw === "true"
              : ["number", "duration"].includes(type)
                ? Number(raw)
                : raw,
      });
    }
  }
  function drawFields(initial = false) {
    const summary = initial
      ? activity?.quantity_field_id
      : valueOf(form, "quantity");
    form.querySelector("[data-fields]").innerHTML = fields
      .map((f, i) => {
        const prefix = `config-${f.id}-`;
        return `<fieldset><legend>Field ${i + 1}</legend><div class="two">${input("Label", prefix + "label", f.label, "text", "required")}${select("Type", prefix + "type", ["number", "text", "multiline", "boolean", "select", "date", "duration"], f.type, `${activity?.fields.some((old) => old.id === f.id) ? "disabled" : ""} data-type="${h(f.id)}"`)}</div>
  ${checkbox("Required", prefix + "required", f.required)}
  ${f.type === "select" ? textarea("Options (one per line)", prefix + "options", f.options.join("\n")) : ""}
  ${["number", "duration"].includes(f.type) ? `<div class="two">${input("Minimum", prefix + "min", f.min, "number", 'step="any"')}${input("Maximum", prefix + "max", f.max, "number", 'step="any"')}</div>` : ""}
  ${
    f.type === "boolean"
      ? select(
          "Default value",
          prefix + "default",
          [
            ["", "No default"],
            ["true", "Completed"],
            ["false", "Not completed"],
          ],
          f.default_value === null ? "" : String(f.default_value),
        )
      : input(
          "Default value (optional)",
          prefix + "default",
          f.default_value,
          ["number", "duration"].includes(f.type)
            ? "number"
            : f.type === "date"
              ? "date"
              : "text",
          'step="any"',
        )
  }
  <div class="row">${i ? button("↑ Move up", "move-field", f.id) : ""}${button("Remove field", "remove-field", f.id, "danger")}</div></fieldset>`;
      })
      .join("");
    form.elements.namedItem("quantity").innerHTML = options(
      [
        ["", "Entry count only"],
        ...fields
          .filter((f) => ["number", "duration"].includes(f.type))
          .map((f) => [f.id, f.label || "Untitled field"]),
      ],
      summary,
    );
  }
  form.addEventListener("click", (e) => {
    const control = e.target.closest("[data-action]");
    if (!control) return;
    const action = control.dataset.action;
    if (!["add-field", "move-field", "remove-field"].includes(action)) return;
    readFields();
    const index = fields.findIndex((f) => f.id === control.dataset.id);
    if (action === "add-field") fields.push(blankField());
    else if (action === "remove-field") fields.splice(index, 1);
    else if (index > 0)
      [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
    drawFields();
  });
  form.addEventListener("change", (e) => {
    if (!e.target.dataset.type) return;
    readFields();
    const f = fields.find((f) => f.id === e.target.dataset.type);
    Object.assign(f, {
      default_value: null,
      min: null,
      max: null,
      options: [],
    });
    drawFields();
  });
  drawFields(true);
}
