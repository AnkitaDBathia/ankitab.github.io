import assert from "node:assert/strict";
// Small assertion adapter retaining the existing regression cases on node:test.
export function expect(value) {
  return {
    toBe: (expected) => assert.equal(value, expected),
    toEqual: (expected) => assert.deepEqual(value, expected),
    toHaveProperty: (key) => assert.ok(Object.hasOwn(value, key)),
    toHaveLength: (length) => assert.equal(value.length, length),
    toThrow: (message) =>
      assert.throws(
        value,
        message ? (e) => e.message.includes(message) : undefined,
      ),
    not: { toThrow: () => assert.doesNotThrow(value) },
    rejects: { toThrow: () => assert.rejects(value) },
  };
}
