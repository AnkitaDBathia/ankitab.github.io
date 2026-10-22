import { beforeEach, afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { sheet } from "../src/ui.js";
import { entryForm, activityForm, itemForm } from "../src/forms.js";
let window;
beforeEach(() => {
  window = new Window({ url: "http://localhost:5173/" });
  globalThis.document = window.document;
});
afterEach(async () => {
  delete globalThis.document;
  await window.happyDOM.close();
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const quantity = {
  id: "quantity",
  label: "Quantity",
  type: "number",
  required: true,
  default_value: 1,
  position: 0,
  options: [],
  min: 1,
  max: 1000,
};
const activity = {
  id: "a",
  name: "Reading",
  seed_key: "reading",
  unit: "pages",
  fields: [quantity],
  quantity_field_id: "quantity",
  presets: [1, 2, 5],
  item_based: true,
};
const items = [{ id: "b", name: "A book", archived: false }];
function submit(form, button = form.querySelector('button[type="submit"]')) {
  form.dispatchEvent(
    new window.SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: button,
    }),
  );
}
describe("Native dialog interactions", () => {
  it("blocks duplicate submission while saving", async () => {
    let calls = 0,
      release;
    const pending = new Promise((resolve) => (release = resolve));
    const { form } = sheet(
      "Save",
      '<button type="submit">Save</button>',
      async () => {
        calls++;
        await pending;
      },
    );
    submit(form);
    submit(form);
    assert.equal(calls, 1);
    release();
    await tick();
    assert.equal(document.querySelector("dialog"), null);
  });
  it("preserves entered values and permits retry after failure", async () => {
    let calls = 0;
    const { form } = sheet(
      "Save",
      '<input name="notes" value="Keep this"><button type="submit">Save</button>',
      async () => {
        calls++;
        if (calls === 1) throw new Error("Connection lost");
      },
    );
    submit(form);
    await tick();
    assert.equal(form.elements.namedItem("notes").value, "Keep this");
    assert.equal(form.querySelector(".error").textContent, "Connection lost");
    submit(form);
    await tick();
    assert.equal(calls, 2);
    assert.equal(document.querySelector("dialog"), null);
  });
  it("saves selected-book preset with local date converted to UTC", async () => {
    let payload;
    entryForm(
      activity,
      items,
      [],
      "2026-10-21",
      "Asia/Kolkata",
      async (row) => {
        payload = row;
      },
    );
    const form = document.querySelector("form");
    form.elements.namedItem("time").value = "00:00";
    submit(form, form.querySelector('[data-preset="5"]'));
    await tick();
    assert.equal(payload.item_id, "b");
    assert.equal(payload.values.quantity, 5);
    assert.equal(payload.occurred_at, "2026-10-20T18:30:00.000Z");
    assert.ok(payload.id);
  });
  it("validates custom fields before writing", async () => {
    let saved = false;
    entryForm(activity, items, [], "2026-10-21", "Asia/Kolkata", async () => {
      saved = true;
    });
    const form = document.querySelector("form");
    form.elements.namedItem("value-quantity").value = "-1";
    submit(form, form.querySelector("button:not([data-preset])"));
    await tick();
    assert.equal(saved, false);
    assert.ok(document.querySelector("dialog"));
    assert.ok(form.querySelector(".error").textContent);
  });
  it("edits a historical entry using its saved fields", async () => {
    let result;
    const edit = {
      id: "log",
      item_id: "b",
      occurred_at: "2026-10-20T18:30:00Z",
      values: { quantity: 2 },
      field_snapshot: [quantity],
    };
    entryForm(
      { ...activity, fields: [] },
      items,
      [],
      "2026-10-21",
      "Asia/Kolkata",
      async (row, id) => {
        result = { row, id };
      },
      edit,
    );
    const form = document.querySelector("form");
    form.elements.namedItem("value-quantity").value = "7";
    submit(form);
    await tick();
    assert.equal(result.id, "log");
    assert.equal(result.row.values.quantity, 7);
    assert.equal(result.row.activity_id, undefined);
  });
  it("creates configurable activity fields through the editor", async () => {
    let result;
    activityForm(async (row) => {
      result = row;
    });
    const form = document.querySelector("form");
    form.elements.namedItem("name").value = "Walking";
    const label = form.querySelector('[name$="-label"]');
    label.value = "Steps";
    const id = label.name.slice(7, -6);
    form.elements.namedItem("quantity").value = id;
    submit(form);
    await tick();
    assert.equal(result.name, "Walking");
    assert.equal(result.fields[0].label, "Steps");
    assert.equal(result.quantity_field_id, id);
  });
  it("saves book metadata and goal", async () => {
    let result;
    itemForm(activity, async (row) => {
      result = row;
    });
    const form = document.querySelector("form");
    form.elements.namedItem("name").value = "My book";
    form.elements.namedItem("author").value = "An author";
    form.elements.namedItem("goal").value = "200";
    form.elements.namedItem("status").value = "Reading";
    submit(form, form.querySelector("button.primary"));
    await tick();
    assert.equal(result.name, "My book");
    assert.equal(result.goal, 200);
    assert.equal(result.status, "Reading");
  });
});
