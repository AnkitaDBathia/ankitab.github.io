import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHTML, fieldControl, readValues } from "../src/ui.js";
describe("Native browser presentation", () => {
  it("escapes untrusted text and attribute values", () =>
    assert.equal(
      escapeHTML('<img src=x onerror="alert(1)">'),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    ));
  it("renders dropdown options as escaped text", () => {
    const html = fieldControl(
      {
        id: "f",
        label: "Type",
        type: "select",
        required: true,
        options: ["<script>"],
        min: null,
        max: null,
      },
      "<script>",
    );
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("selected"));
  });
  it("reads boolean and numeric form values without coercing empty values to zero", () => {
    const fields = [
      { id: "a", type: "number" },
      { id: "b", type: "boolean" },
      { id: "c", type: "duration" },
    ];
    const controls = {
      "value-a": { value: "12" },
      "value-b": { checked: false },
      "value-c": { value: "" },
    };
    assert.deepEqual(
      readValues({ elements: { namedItem: (name) => controls[name] } }, fields),
      { a: 12, b: false, c: "" },
    );
  });
  it("uses relative browser assets that work under repository subpaths", () => {
    const html = readFileSync(
      new URL("../index.html", import.meta.url),
      "utf8",
    );
    assert.ok(html.includes('src="./src/start.js?v='));
    assert.ok(html.includes('href="./src/style.css?v='));
    assert.ok(html.includes('src="./config.js?v='));
    assert.ok(html.includes('type="importmap"'));
  });
  it("has no framework or bundler dependency", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    for (const name of [
      "react",
      "react-dom",
      "vite",
      "recharts",
      "vite-plugin-pwa",
    ])
      assert.ok(!pkg.dependencies?.[name] && !pkg.devDependencies?.[name]);
  });
});
