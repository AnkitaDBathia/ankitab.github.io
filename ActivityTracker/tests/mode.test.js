import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isGuestMode } from "../src/mode.js";
import { renderView } from "../src/views.js";
import { createGuestStore } from "../src/guest.js";
describe("Database mode", () => {
  it("defaults to Supabase, requiring an explicit boolean to enter guest mode", () => {
    for (const config of [
      undefined,
      {},
      { guestMode: false },
      { guestMode: "true" },
    ])
      assert.equal(isGuestMode(config), false);
    assert.equal(isGuestMode({ guestMode: true }), true);
  });
  it("shows the authenticated account and sign-out controls by default", () => {
    const data = createGuestStore({
      getItem: () => null,
      setItem: () => {},
    }).load();
    const html = renderView(
      data,
      { page: "settings", day: "2026-10-26" },
      "owner@example.com",
    );
    assert.ok(html.includes("Signed in as owner@example.com"));
    assert.ok(html.includes('data-action="signout"'));
    assert.ok(!html.includes("Temporary guest mode"));
  });
});
