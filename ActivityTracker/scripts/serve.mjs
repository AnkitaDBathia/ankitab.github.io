import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const app = new URL("../", import.meta.url);
const port = Number(process.env.PORT || 5173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = path === "/" ? "index.html" : path.slice(1);
    // Explicit allowlist: never expose environment files, tests or dependencies.
    if (
      !["index.html", "config.js"].includes(file) &&
      !/^src\/[a-z-]+\.(js|css)$/.test(file)
    ) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let body;
    try {
      body = await readFile(new URL(file, app));
    } catch (e) {
      if (file !== "config.js") throw e;
      body = await readFile(new URL("config.example.js", app));
    }
    const extension = file.slice(file.lastIndexOf("."));
    res.writeHead(200, {
      "Content-Type": types[extension] || "text/plain",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `My Journey: http://localhost:${port}/ (serving ${fileURLToPath(app)})`,
  ),
);
