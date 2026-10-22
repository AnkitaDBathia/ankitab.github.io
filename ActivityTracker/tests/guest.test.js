import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGuestStore, STORAGE_KEY } from "../src/guest.js";
import { renderView } from "../src/views.js";
const memory = () => {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  };
};
describe("Temporary guest journal", () => {
  it("initializes five activities without duplicate defaults on reload", () => {
    const storage = memory(),
      store = createGuestStore(storage);
    const first = store.load();
    assert.equal(first.activities.length, 5);
    assert.deepEqual(createGuestStore(storage).load(), first);
  });
  it("persists, edits and deletes real guest entries", () => {
    const storage = memory(),
      store = createGuestStore(storage),
      a = store.load().activities[0];
    const log = store.save("activity_logs", {
      activity_id: a.id,
      item_id: null,
      values: { quantity: 2 },
      occurred_at: "2026-10-22T10:00:00Z",
    });
    assert.equal(createGuestStore(storage).load().logs[0].values.quantity, 2);
    store.save("activity_logs", { values: { quantity: 5 } }, log.id);
    assert.equal(store.load().logs[0].values.quantity, 5);
    store.remove(log.id);
    assert.equal(store.load().logs.length, 0);
  });
  it("validates entries and preserves historical fields after reconfiguration", () => {
    const store = createGuestStore(memory()),
      a = store.load().activities[0];
    assert.throws(() =>
      store.save("activity_logs", {
        activity_id: a.id,
        values: { quantity: -1 },
        occurred_at: "2026-10-22T10:00:00Z",
      }),
    );
    const log = store.save("activity_logs", {
      activity_id: a.id,
      item_id: null,
      values: { quantity: 2 },
      occurred_at: "2026-10-22T10:00:00Z",
    });
    store.save("activities", { fields: [], quantity_field_id: null }, a.id);
    const updated = store.save(
      "activity_logs",
      { values: { quantity: 3 } },
      log.id,
    );
    assert.equal(updated.field_snapshot[0].id, "quantity");
    assert.equal(updated.quantity_field_id, "quantity");
    assert.throws(
      () => store.save("activity_logs", { ...log }),
      "Duplicate entry",
    );
  });
  it("requires owned active items and persists preferences", () => {
    const store = createGuestStore(memory()),
      a = store.load().activities[1];
    const entry = {
      activity_id: a.id,
      item_id: "missing",
      values: { quantity: 1 },
      occurred_at: "2026-10-22T10:00:00Z",
    };
    assert.throws(() => store.save("activity_logs", entry));
    const item = store.save("activity_items", {
      activity_id: a.id,
      name: "My book",
      goal: null,
    });
    store.save("activity_logs", { ...entry, item_id: item.id });
    store.save("user_settings", { timezone: "UTC", display_name: "Guest" });
    assert.equal(store.load().settings.timezone, "UTC");
  });
  it("surfaces storage failures without claiming success or replacing damaged data", () => {
    const storage = memory();
    storage.setItem(STORAGE_KEY, "bad data");
    assert.throws(() => createGuestStore(storage).load());
    assert.equal(storage.getItem(STORAGE_KEY), "bad data");
    assert.throws(
      () =>
        createGuestStore({
          getItem: () => null,
          setItem: () => {
            throw new Error("Storage full");
          },
        }).load(),
      /Storage full/,
    );
  });
  it("clearly labels guest storage and hides sign-out controls", () => {
    const data = createGuestStore(memory()).load();
    const html = renderView(data, { page: "dashboard", day: "2026-10-22" }, "");
    assert.ok(html.includes("not Supabase"));
    assert.ok(!html.includes('data-action="signout"'));
    const settings = renderView(
      data,
      { page: "settings", day: "2026-10-22" },
      "",
    );
    assert.ok(!settings.includes("Signed in as"));
  });
});
