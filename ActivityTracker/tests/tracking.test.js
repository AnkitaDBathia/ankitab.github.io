import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { activityForm, entryForm } from "../src/forms.js";
import {
  simpleFields,
  quickDoneValues,
  automaticOccurrence,
} from "../src/tracking.js";
import { activityAction } from "../src/views.js";
let window;
beforeEach(() => {
  window = new Window({ url: "http://localhost:5173" });
  globalThis.document = window.document;
});
afterEach(async () => {
  delete globalThis.document;
  await window.happyDOM.close();
});
const tick = () => new Promise((r) => setTimeout(r, 0));
function submit(form) {
  form.dispatchEvent(
    new window.SubmitEvent("submit", { bubbles: true, cancelable: true }),
  );
}
const yoga = () => ({
  id: "yoga",
  name: "Yoga",
  icon: "leaf",
  position: 3,
  description: "",
  unit: "",
  presets: [],
  quantity_field_id: null,
  item_based: false,
  fields: simpleFields("done"),
});
describe("Simple tracking", () => {
  it("offers direct completion and disables it after a successful daily log", () => {
    const a = yoga(),
      values = quickDoneValues(a);
    assert.equal(values[a.fields[0].id], true);
    assert.ok(activityAction(a, []).includes('data-action="mark-done"'));
    assert.ok(!activityAction(a, []).includes('data-action="entry"'));
    const done = activityAction(a, [
      { activity_id: a.id, values, field_snapshot: a.fields },
    ]);
    assert.ok(done.includes("disabled"));
    assert.ok(done.includes("Done"));
  });
  it("supports existing yoga defaults but requires a form when information is missing", () => {
    const a = yoga();
    a.fields.push({
      id: "type",
      label: "Type",
      type: "select",
      required: true,
      options: ["General"],
      default_value: "General",
      min: null,
      max: null,
    });
    assert.equal(quickDoneValues(a).type, "General");
    a.fields[1].default_value = null;
    assert.equal(quickDoneValues(a), null);
    assert.equal(quickDoneValues({ ...yoga(), item_based: true }), null);
  });
  it("creates a done-only activity with just a name", async () => {
    let result;
    activityForm(async (row) => {
      result = row;
    });
    const form = document.querySelector("form");
    form.elements.namedItem("name").value = "Yoga";
    submit(form);
    await tick();
    assert.equal(result.fields.length, 1);
    assert.equal(result.fields[0].type, "boolean");
    assert.equal(result.quantity_field_id, null);
    assert.deepEqual(result.presets, []);
    assert.equal(result.unit, "");
  });
  it("creates quantity tracking without configuring fields", async () => {
    let result;
    activityForm(async (row) => {
      result = row;
    });
    const form = document.querySelector("form");
    form.elements.namedItem("name").value = "Walking";
    const mode = form.elements.namedItem("tracking");
    mode.value = "quantity";
    mode.dispatchEvent(new window.Event("change", { bubbles: true }));
    form.elements.namedItem("unit").value = "steps";
    submit(form);
    await tick();
    assert.equal(result.fields[0].type, "number");
    assert.equal(result.quantity_field_id, result.fields[0].id);
    assert.equal(result.unit, "steps");
    assert.deepEqual(result.presets, [1, 2, 5]);
  });
  it("simplifies an existing practice without altering its old configuration object", async () => {
    let result;
    const a = yoga();
    a.fields.push({
      id: "notes",
      label: "Notes",
      type: "text",
      required: false,
      default_value: null,
      options: [],
      min: null,
      max: null,
    });
    activityForm(async (row) => {
      result = row;
    }, a);
    const form = document.querySelector("form");
    form.elements.namedItem("tracking").value = "done";
    submit(form);
    await tick();
    assert.equal(result.fields.length, 1);
    assert.equal(a.fields.length, 2);
    assert.equal(result.fields[0].id, a.fields[0].id);
  });
  it("keeps date and time collapsed and records the selected past day automatically", async () => {
    let result;
    const a = yoga();
    entryForm(a, [], [], "2020-01-02", "Asia/Kolkata", async (row) => {
      result = row;
    });
    const form = document.querySelector("form");
    assert.equal(form.querySelector("[data-timestamp]").open, false);
    submit(form);
    await tick();
    assert.equal(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(result.occurred_at)),
      "2020-01-02",
    );
  });
  it("records the actual current instant for today and preserves timezone for past days", () => {
    const now = new Date("2026-10-26T18:31:22Z");
    assert.equal(
      automaticOccurrence("2026-10-27", "Asia/Kolkata", now),
      now.toISOString(),
    );
    assert.equal(
      automaticOccurrence("2026-10-25", "Asia/Kolkata", now),
      "2026-10-24T18:31:00.000Z",
    );
  });
});
