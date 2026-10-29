import { it } from "node:test";
import assert from "node:assert/strict";
import { createResumeSync } from "../src/sync.js";
const wait = () => new Promise(resolve => setTimeout(resolve, 25));

it("coalesces return events and waits until editing finishes", async () => {
  let allowed = false, calls = 0;
  const sync = createResumeSync({ delay: 2, canRun: () => allowed,
    run: async () => { calls++; }, onError: assert.fail });
  try {
    sync.request(); sync.request();
    await wait();
    assert.equal(calls, 0);
    allowed = true;
    await wait();
    assert.equal(calls, 1);
  } finally { sync.cancel(); }
});

it("retries a discarded snapshot without overlapping requests", async () => {
  let calls = 0, release;
  const sync = createResumeSync({ delay: 2, canRun: () => true,
    run: async () => {
      calls++;
      if (calls === 1) return await new Promise(resolve => { release = resolve; });
    }, onError: assert.fail });
  try {
    sync.request();
    await wait();
    sync.request();
    await wait();
    assert.equal(calls, 1);
    release(false);
    await wait();
    assert.equal(calls, 2);
  } finally { sync.cancel(); }
});

it("reports connection failure once and cancels deferred work on sign-out", async () => {
  let calls = 0, errors = 0, allowed = true;
  const sync = createResumeSync({ delay: 2, canRun: () => allowed,
    run: async () => { calls++; throw new Error("Offline"); },
    onError: () => { errors++; } });
  try {
    sync.request();
    await wait();
    assert.equal(errors, 1);
    allowed = false;
    sync.request();
    sync.cancel();
    allowed = true;
    await wait();
    assert.equal(calls, 1);
  } finally { sync.cancel(); }
});
