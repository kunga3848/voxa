// Copie l'interface (aucune compilation nécessaire) dans dist/.
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });
cpSync(join(root, "index.html"), join(dist, "index.html"));
cpSync(join(root, "src"), join(dist, "src"), { recursive: true });
cpSync(join(root, "assets", "icon.svg"), join(dist, "assets", "icon.svg"));
cpSync(join(root, "assets", "voices"), join(dist, "assets", "voices"), { recursive: true });
console.log("Interface copiée dans dist/");
