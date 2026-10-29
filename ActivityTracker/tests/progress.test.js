import { it } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { notify } from "../src/ui.js";
it("keeps Undo available after a failed request and removes feedback after successful retry", async () => {
  const window = new Window();
  globalThis.document = window.document;
  let attempts = 0;
  try {
    notify("Yoga saved for yesterday.", async () => {
      attempts++;
      if (attempts === 1) throw new Error("Offline");
    });
    const button = document.querySelector(".toast button");
    await button.onclick();
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, "Retry undo");
    assert.ok(document.querySelector(".toast"));
    await button.onclick();
    assert.equal(document.querySelector(".toast"), null);
    assert.equal(attempts, 2);
  } finally {
    delete globalThis.document;
    await window.happyDOM.close();
  }
});
import {
  goalProgress,
  rolloverDay,
  latestCompletion,
} from "../src/tracking.js";
import { activityAction, targetSummary } from "../src/views.js";
const activity = {
  id: "a",
  unit: "pages",
  quantity_field_id: "q",
  daily_goal: 20,
};
const logs = [
  {
    id: "old",
    activity_id: "a",
    item_id: "book",
    occurred_at: "2026-10-28T10:00:00Z",
    quantity_field_id: "q",
    values: { q: 10 },
  },
  {
    id: "new",
    activity_id: "a",
    item_id: "book",
    occurred_at: "2026-10-29T10:00:00Z",
    quantity_field_id: "q",
    values: { q: 18 },
  },
];
it("uses selected-day totals for daily goals and all dates for overall item goals", () => {
  assert.equal(
    goalProgress(activity, null, logs, "2026-10-29", "UTC").text,
    "2 pages to go",
  );
  assert.equal(
    goalProgress(activity, { id: "book", goal: 30 }, logs, "2026-10-29", "UTC")
      .remaining,
    2,
  );
  assert.equal(
    goalProgress(
      activity,
      { id: "book", goal: 30, goal_period: "daily" },
      logs,
      "2026-10-29",
      "UTC",
    ).remaining,
    12,
  );
  assert.equal(
    goalProgress(activity, null, logs, "2026-10-30", "UTC").remaining,
    20,
  );
  assert.equal(
    goalProgress(
      { ...activity, daily_goal: 10 },
      null,
      logs,
      "2026-10-29",
      "UTC",
    ).text,
    "Goal reached!",
  );
});
it("shows target and remaining amount together", () => {
  const html = targetSummary(
    activity,
    null,
    { logs, settings: { timezone: "UTC" } },
    "2026-10-29",
  );
  assert.ok(html.includes("18 / 20 pages"));
  assert.ok(html.includes("2 pages to go"));
});
it("resets stale dates only when the calendar day changes", () => {
  assert.equal(
    rolloverDay("2026-10-20", "2026-10-29", "2026-10-29"),
    "2026-10-20",
  );
  assert.equal(
    rolloverDay("2026-10-20", "2026-10-29", "2026-10-30"),
    "2026-10-30",
  );
});
it("offers undo for only the latest completed entry, excluding false entries", () => {
  const fields = [
    { id: "done", type: "boolean", required: true, default_value: true },
  ];
  const yoga = { id: "y", fields, item_based: false };
  const entries = [
    {
      id: "one",
      activity_id: "y",
      occurred_at: "2026-10-29T10:00:00Z",
      field_snapshot: fields,
      values: { done: true },
    },
    {
      id: "two",
      activity_id: "y",
      occurred_at: "2026-10-29T11:00:00Z",
      field_snapshot: fields,
      values: { done: true },
    },
    {
      id: "three",
      activity_id: "y",
      occurred_at: "2026-10-29T12:00:00Z",
      field_snapshot: fields,
      values: { done: false },
    },
  ];
  assert.equal(latestCompletion(entries, "y").id, "two");
  assert.ok(
    activityAction(yoga, entries).includes(
      'data-action="undo-log" data-id="two"',
    ),
  );
  assert.equal(
    latestCompletion(
      entries.filter((l) => l.id === "three"),
      "y",
    ),
    undefined,
  );
});
