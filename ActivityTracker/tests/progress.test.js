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
    "Goal reached! 8 pages extra",
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

it("keeps item logging available beyond the goal with the correct item selected", () => {
  const item = {id:"book",name:"GIP",goal:9,goal_period:"daily"};
  const html = targetSummary(activity,item,{logs,settings:{timezone:"UTC"}},"2026-10-29",true);
  assert.ok(html.includes('data-action="increment-item" data-id="book"'));
  assert.ok(html.includes('aria-label="Add 1 to GIP"'));
  assert.ok(!html.includes("disabled"));
  assert.ok(html.includes("9 pages extra"));
  assert.ok(!targetSummary(activity,{...item,archived:true},{logs,settings:{timezone:"UTC"}},"2026-10-29",true).includes('data-action="increment-item"'));
});
it("allows another entry for a completed done-only activity", () => {
  const fields = [{id:"done",type:"boolean",required:true,default_value:true}];
  const a = {id:"y",fields,item_based:false};
  const html = activityAction(a,[{id:"log",activity_id:"y",values:{done:true},field_snapshot:fields}]);
  assert.ok(html.includes("+ Log again"));
  assert.ok(html.includes('data-action="entry" data-id="y"'));
});

it("quick counter adds exactly one while preserving valid defaults", async () => {
  const {quickQuantityValues} = await import("../src/tracking.js");
  const a = {quantity_field_id:"q",fields:[{id:"q",type:"number",required:true,default_value:108,min:1,max:null}]};
  assert.deepEqual(quickQuantityValues(a),{q:1});
  assert.equal(quickQuantityValues({...a,archived:true}),null);
  assert.equal(quickQuantityValues({...a,fields:[...a.fields,{id:"note",type:"text",required:true,default_value:null}]}),null);
});

it("derives compact target amounts and a remaining shortcut", async () => {
  const {quickAmounts, quickQuantityValues} = await import("../src/tracking.js");
  assert.deepEqual(quickAmounts(9), [1,3]);
  assert.deepEqual(quickAmounts(27), [1,9,18,27]);
  assert.deepEqual(quickAmounts(108), [1,12,24,36]);
  assert.deepEqual(quickAmounts(108,5), [1,5]);
  assert.deepEqual(quickAmounts(27,0), [1,9,18,27]);
  assert.deepEqual(quickAmounts(1), [1]);
  for (const goal of [2,7,13,50,101,1000]) {
    const amounts = quickAmounts(goal);
    assert.ok(amounts.length <= 4);
    assert.ok(amounts.every(n=> n > 0 && Number.isInteger(n)));
    assert.equal(new Set(amounts).size, amounts.length);
  }
  const a = {quantity_field_id:"q",fields:[{id:"q",type:"number",required:true,default_value:1,min:1,max:108}]};
  assert.deepEqual(quickQuantityValues(a,24),{q:24});
  for (const invalid of [0,-1,NaN,Infinity,109]) assert.equal(quickQuantityValues(a,invalid),null);
});
