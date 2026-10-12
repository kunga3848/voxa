// Petit serveur local pour tester l'interface : node scripts/serve.mjs  ->  http://localhost:5173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  try {
    const body = await readFile(join(root, path === "/" ? "index.html" : path));
    res.writeHead(200, { "Content-Type": types[extname(path)] || "text/html" }).end(body);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(5173, () => console.log("Interface sur http://localhost:5173"));
