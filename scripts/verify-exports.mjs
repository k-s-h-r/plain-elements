import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const referenced = new Set();

function collect(value) {
  if (typeof value === "string") {
    if (value.startsWith("./")) {
      referenced.add(value);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      collect(nested);
    }
  }
}

collect(pkg.exports);

const missing = [];
for (const relative of referenced) {
  if (!existsSync(resolve(root, relative))) {
    missing.push(relative);
  }
}

if (missing.length > 0) {
  console.error("Missing files referenced by package.json exports:");
  for (const file of missing) {
    console.error(`  - ${file}`);
  }
  console.error("Run `npm run build` before publishing.");
  process.exit(1);
}

console.log(
  `Verified ${referenced.size} export target${referenced.size === 1 ? "" : "s"}; all present in dist/.`
);
