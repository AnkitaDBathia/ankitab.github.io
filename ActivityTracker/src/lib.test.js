import { describe, it } from "node:test";
import { expect } from "../tests/assertions.js";
import {
  completed,
  localDay,
  moveDay,
  occurrence,
  onDay,
  total,
  validateActivity,
  validateFields,
} from "./lib.js";
const field = {
  id: "qty",
  label: "Pages",
  type: "number",
  required: true,
  default_value: 1,
  position: 0,
  options: [],
  min: 1,
  max: 500,
};
const log = (id, qty, item = "book-a", time = "2026-10-20T18:30:00Z") => ({
  id,
  user_id: "u",
  activity_id: "reading",
  item_id: item,
  values: { qty },
  field_snapshot: [field],
  quantity_field_id: "qty",
  occurred_at: time,
  created_at: time,
  updated_at: time,
});
describe("Timezone boundaries", () => {
  it("uses Kolkata midnight, not UTC midnight", () => {
    expect(localDay("2026-10-20T18:29:59Z", "Asia/Kolkata")).toBe("2026-10-20");
    expect(localDay("2026-10-20T18:30:00Z", "Asia/Kolkata")).toBe("2026-10-21");
  });
  it("converts user wall time to UTC", () =>
    expect(occurrence("2026-10-21", "00:00", "Asia/Kolkata")).toBe(
      "2026-10-20T18:30:00.000Z",
    ));
  it("filters precisely at midnight", () =>
    expect(
      onDay(
        [log("1", 5, "a", "2026-10-20T18:29:59Z"), log("2", 2)],
        "2026-10-21",
        "Asia/Kolkata",
      ).map((l) => l.id),
    ).toEqual(["2"]));
  it("moves dates across month and year boundaries", () => {
    expect(moveDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(moveDay("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("rejects nonexistent DST times and handles both DST offsets", () => {
    expect(() => occurrence("2026-03-08", "02:30", "America/New_York")).toThrow(
      "does not exist",
    );
    expect(occurrence("2026-03-08", "01:30", "America/New_York")).toBe(
      "2026-03-08T06:30:00.000Z",
    );
    expect(occurrence("2026-03-08", "03:30", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });
});
describe("Dynamic field validation", () => {
  it("requires values and rejects non-finite / out-of-bounds numbers", () => {
    for (const v of ["", 0, 501, NaN, Infinity, "4"])
      expect(validateFields([field], { qty: v })).toHaveProperty("qty");
    expect(validateFields([field], { qty: 5 })).toEqual({});
  });
  it("accepts false completion and optional empty values", () => {
    expect(
      validateFields([{ ...field, type: "boolean" }], { qty: false }),
    ).toEqual({});
    expect(validateFields([{ ...field, required: false }], {})).toEqual({});
  });
  it("validates dates and dropdown options", () => {
    expect(
      validateFields([{ ...field, type: "date" }], { qty: "2026-02-30" }),
    ).toHaveProperty("qty");
    expect(
      validateFields([{ ...field, type: "select", options: ["General"] }], {
        qty: "Other",
      }),
    ).toHaveProperty("qty");
  });
  it("validates activity creation and defaults", () => {
    const a = {
      name: "Walking",
      fields: [field],
      presets: [1, 5],
      quantity_field_id: "qty",
    };
    expect(() => validateActivity(a)).not.toThrow();
    expect(() => validateActivity({ ...a, name: " " })).toThrow();
    expect(() => validateActivity({ ...a, fields: [field, field] })).toThrow();
    expect(() =>
      validateActivity({ ...a, fields: [{ ...field, default_value: -1 }] }),
    ).toThrow();
    expect(() =>
      validateActivity({ ...a, quantity_field_id: "missing" }),
    ).toThrow();
  });
});
describe("Totals", () => {
  it("calculates book-specific and combined totals after edits and deletes", () => {
    const logs = [log("a", 5), log("b", 2, "book-b"), log("c", 3)];
    expect(total(logs, "reading")).toBe(10);
    expect(total(logs, "reading", "book-a")).toBe(8);
    expect(
      total(
        logs.map((l) => (l.id === "a" ? { ...l, values: { qty: 10 } } : l)),
        "reading",
      ),
    ).toBe(15);
    expect(
      total(
        logs.filter((l) => l.id !== "a"),
        "reading",
      ),
    ).toBe(5);
  });
  it("isolates mantra items and activities", () => {
    const logs = [
      { ...log("m1", 108, "mantra-a"), activity_id: "mantra" },
      { ...log("m2", 11, "mantra-b"), activity_id: "mantra" },
      log("r", 5),
    ];
    expect(total(logs, "mantra")).toBe(119);
    expect(total(logs, "mantra", "mantra-a")).toBe(108);
  });
  it("uses recorded summary field after configuration changes", () =>
    expect(
      total(
        [
          log("a", 5),
          {
            ...log("b", 1),
            values: { newQty: 7 },
            quantity_field_id: "newQty",
          },
        ],
        "reading",
      ),
    ).toBe(12));
  it("does not mark a false practice complete", () => {
    const l = {
      ...log("a", 0),
      field_snapshot: [{ ...field, type: "boolean" }],
      values: { qty: false },
    };
    expect(completed([l], "reading")).toBe(false);
    expect(completed([{ ...l, values: { qty: true } }], "reading")).toBe(true);
  });
});
