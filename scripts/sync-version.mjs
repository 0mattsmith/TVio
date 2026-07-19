/**
 * Aligns the app version with the release tag so the in-app updater compares
 * against the right thing. Run in CI as: node scripts/sync-version.mjs v0.1.2
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const version = (process.argv[2] || "").replace(/^v/, "").trim();
if (!version) {
  console.log("No tag supplied — leaving versions unchanged.");
  process.exit(0);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`package.json → ${version}`);

const conf = "src-tauri/tauri.conf.json";
if (existsSync(conf)) {
  const c = JSON.parse(readFileSync(conf, "utf8"));
  c.version = version;
  writeFileSync(conf, `${JSON.stringify(c, null, 2)}\n`);
  console.log(`tauri.conf.json → ${version}`);
}
