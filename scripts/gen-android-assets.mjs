/**
 * Generates the Android launcher icons + Android TV banner in TVio's brand.
 *
 * Run AFTER `npx cap add android` — it writes straight into the generated
 * project, replacing Capacitor's stock icons:
 *
 *   res/mipmap-<dpi>/ic_launcher.png        legacy launcher (48→192)
 *   res/mipmap-<dpi>/ic_launcher_round.png  round mask variant
 *   res/drawable/ic_launcher_foreground.png adaptive foreground (432, safe-zoned)
 *   res/values/ic_launcher_background.xml   adaptive background colour
 *   res/mipmap-anydpi-v26/ic_launcher*.xml  adaptive icon definitions
 *   res/drawable-xhdpi/banner.png           Android TV home-row banner (320x180)
 *
 * The mark is the app wordmark: a bold white "TV" with a smaller teal "io"
 * tucked into it, which stays legible right down to 48px.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";

const RES = "android/app/src/main/res";
const BG = "#0a0a0a";
const ACCENT = "#14b8a6";
const FONT = "Roboto, Inter, Arial, Helvetica, sans-serif";

if (!existsSync("android/app/src/main")) {
  console.error("No Android project found — run 'npx cap add android' first.");
  process.exit(1);
}

const glow = (id, cx, cy, r) =>
  `<defs><radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
     <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.30"/>
     <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
   </radialGradient></defs>`;

/** "TV" with a smaller "io" pulled in so it overlaps slightly. */
const wordmark = (cx, cy, size) => {
  const io = size * 0.52;
  return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
      font-family="${FONT}" font-weight="900" font-size="${size}" letter-spacing="${-size * 0.04}">
      <tspan fill="#ffffff">TV</tspan><tspan fill="${ACCENT}" font-size="${io}" dx="${-io * 0.14}">io</tspan>
    </text>`;
};

/** Square launcher icon. `round` draws a circular background instead. */
const iconSvg = (n, round) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">
    ${glow("g", n / 2, n * 0.34, n * 0.8)}
    ${
      round
        ? `<circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}" fill="${BG}"/>
           <circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}" fill="url(#g)"/>`
        : `<rect width="${n}" height="${n}" rx="${n * 0.2}" fill="${BG}"/>
           <rect width="${n}" height="${n}" rx="${n * 0.2}" fill="url(#g)"/>`
    }
    ${wordmark(n / 2, n / 2, n * (round ? 0.3 : 0.32))}
  </svg>`;

/**
 * Adaptive foreground: transparent, and the mark must stay inside the middle
 * ~66% because launchers crop the rest to whatever shape they like. Kept a
 * little larger here (@capacitor/assets adds its own safe-zone padding).
 */
const foregroundSvg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">
    ${wordmark(n / 2, n / 2, n * 0.26)}
  </svg>`;

/** Adaptive background layer: the dark tile with its teal glow, no wordmark. */
const backgroundSvg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">
    ${glow("g", n / 2, n * 0.34, n * 0.8)}
    <rect width="${n}" height="${n}" fill="${BG}"/>
    <rect width="${n}" height="${n}" fill="url(#g)"/>
  </svg>`;

const bannerSvg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${BG}"/>
    ${glow("g", w * 0.5, h * 0.4, w * 0.7)}<rect width="${w}" height="${h}" fill="url(#g)"/>
    ${wordmark(w / 2, h * 0.46, h * 0.34)}
    <rect x="0" y="${h - 4}" width="${w}" height="4" fill="${ACCENT}"/>
  </svg>`;

// Supersample everything (draw at 4x, downsample) for clean edges at small sizes.
const SS = 4;
async function png(svg, size, out) {
  mkdirSync(out.substring(0, out.lastIndexOf("/")), { recursive: true });
  const buf = await sharp(Buffer.from(svg))
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  writeFileSync(out, buf);
}

const DENSITIES = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];

async function main() {
  // Write the SOURCE images that @capacitor/assets turns into the real launcher
  // resources. Hand-writing the res/ files ourselves is what kept shipping the
  // stock robot icon — the exact resource names, types and adaptive-icon XML
  // Android expects are fiddly and version-specific. @capacitor/assets is
  // Capacitor's own tool for exactly this, so it produces the correct set every
  // time; the CI step that follows this one runs it.
  console.log("Generating source icon assets for @capacitor/assets…");
  await png(iconSvg(1024, false), 1024, "assets/icon-only.png");
  await png(foregroundSvg(1024), 1024, "assets/icon-foreground.png");
  await png(backgroundSvg(1024), 1024, "assets/icon-background.png");
  console.log("  ✓ assets/icon-only, icon-foreground, icon-background (1024px)");

  // The Android TV home-row banner isn't something @capacitor/assets makes, so
  // it's still written straight into res/ (survives the generate step, which
  // only touches icon/splash resources).
  mkdirSync(`${RES}/drawable-xhdpi`, { recursive: true });
  const banner = await sharp(Buffer.from(bannerSvg(320 * SS, 180 * SS)))
    .resize(320, 180, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  writeFileSync(`${RES}/drawable-xhdpi/banner.png`, banner);
  console.log("  ✓ Android TV banner (320x180)");
}

/**
 * Every file the APK needs for branded icons. Verified explicitly because a
 * skipped or half-finished run doesn't look like an error — it just ships the
 * stock green Android robot, which is easy to miss until the APK is installed.
 */
const EXPECTED = [
  "assets/icon-only.png",
  "assets/icon-foreground.png",
  "assets/icon-background.png",
  `${RES}/drawable-xhdpi/banner.png`,
];

function verify() {
  console.log("\nVerifying:");
  const missing = [];
  for (const f of EXPECTED) {
    const size = existsSync(f) ? statSync(f).size : 0;
    if (size < 100) missing.push(f);
    console.log(`  ${size >= 100 ? "✓" : "✗"} ${f}${size ? ` (${size} bytes)` : " — MISSING"}`);
  }
  if (missing.length) {
    console.error(`\n${missing.length} icon asset(s) missing or empty — the APK would ship stock icons.`);
    process.exit(1);
  }
  console.log(`\nAll ${EXPECTED.length} icon assets written.`);
}

main()
  .then(verify)
  .catch((e) => {
    console.error("Android asset generation failed:", e);
    process.exit(1);
  });
