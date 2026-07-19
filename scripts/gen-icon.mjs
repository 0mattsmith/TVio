// Rasterizes public/icon.svg to a 1024x1024 PNG for the native app icons.
// Used in CI before `tauri icon`. Requires `sharp` (a devDependency).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "build/icon-1024.png";

async function main() {
  const sharp = (await import("sharp")).default;
  const svg = readFileSync("public/icon.svg");
  mkdirSync(dirname(OUT), { recursive: true });
  const png = await sharp(svg, { density: 384 }).resize(1024, 1024, { fit: "contain", background: "#0a0a0a" }).png().toBuffer();
  writeFileSync(OUT, png);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error("Icon generation failed:", e);
  process.exit(1);
});
