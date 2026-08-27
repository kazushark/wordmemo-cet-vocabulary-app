import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 4173);
const root = new URL(".", import.meta.url).pathname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

createServer((request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  let path = normalize(join(root, relativePath));

  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) {
    path = join(root, "index.html");
  }

  response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" });
  createReadStream(path).pipe(response);
}).listen(port, () => {
  console.log(`WordMemo is running at http://localhost:${port}`);
});
