// Copy browser-ready files for Pages. No compilation or bundling.
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
const app = new URL("../", import.meta.url),
  output = new URL("../site/", app);
await mkdir(new URL("src/", output), { recursive: true });
await copyFile(new URL("index.html", app), new URL("index.html", output));
for (const file of [
  "app.js",
  "data.js",
  "forms.js",
  "guest.js",
  "mode.js",
  "lib.js",
  "start.js",
  "supabase.js",
  "ui.js",
  "views.js",
  "style.css",
])
  await copyFile(new URL("src/" + file, app), new URL("src/" + file, output));
let config;
if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) {
  config =
    "window.MY_JOURNEY_CONFIG = " +
    JSON.stringify({
      guestMode: false,
      supabaseUrl: process.env.SUPABASE_URL,
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    }) +
    ";\n";
} else {
  config = await readFile(new URL("config.js", app), "utf8");
}
await writeFile(new URL("config.js", output), config);
await writeFile(new URL(".nojekyll", output), "");
console.log("Static website copied to site/.");
