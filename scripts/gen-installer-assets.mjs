/**
 * Generates the branded Windows installer artwork + the master app icon.
 *
 *   build/icon-1024.png            → fed to `tauri icon` (exe / Start menu / taskbar)
 *   src-tauri/installer/header.bmp   150x57   NSIS header strip
 *   src-tauri/installer/sidebar.bmp  164x314  NSIS welcome/finish sidebar
 *   src-tauri/installer/banner.bmp   493x58   WiX (MSI) top banner
 *   src-tauri/installer/dialog.bmp   493x312  WiX (MSI) welcome background
 *
 * NSIS and WiX both require *BMP* images, which sharp cannot encode, so we
 * render to raw RGB with sharp and write a 24-bit BMP by hand.
 *
 * Run locally with `npm run gen:installer` and commit src-tauri/installer/*.bmp
 * for fully reproducible builds (CI also runs it).
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = "#0a0a0a";
const ACCENT = "#14b8a6";
const FONT = "Segoe UI, Inter, Arial, Helvetica, sans-serif";

// --- 24-bit BMP encoder (bottom-up, BGR, rows padded to 4 bytes) -------------
function encodeBmp24(rgb, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixels = rowSize * height;
  const buf = Buffer.alloc(54 + pixels);

  buf.write("BM", 0);
  buf.writeUInt32LE(54 + pixels, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset
  buf.writeUInt32LE(40, 14); // BITMAPINFOHEADER
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(0, 30); // BI_RGB
  buf.writeUInt32LE(pixels, 34);
  buf.writeInt32LE(2835, 38); // 72 DPI
  buf.writeInt32LE(2835, 42);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // BMP rows run bottom-to-top
    let off = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (srcY * width + x) * 3;
      buf[off++] = rgb[i + 2]; // B
      buf[off++] = rgb[i + 1]; // G
      buf[off++] = rgb[i];     // R
    }
  }
  return buf;
}

async function svgToBmp(svg, width, height, out) {
  const { data } = await sharp(Buffer.from(svg))
    .resize(width, height)
    .flatten({ background: BG })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  writeFileSync(out, encodeBmp24(data, width, height));
  console.log(`  ✓ ${out}`);
}

// --- Artwork ----------------------------------------------------------------
// A dark panel with a soft teal glow and the TVio wordmark. Shapes carry the
// branding even if the runner lacks the font, so it degrades gracefully.
function glowDefs(id, cx, cy, r) {
  return `<defs><radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient></defs>`;
}

function wordmark(x, y, size, anchor = "middle") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle"
      font-family="${FONT}" font-weight="900" font-size="${size}" letter-spacing="${-size * 0.04}">
      <tspan fill="#ffffff">TV</tspan><tspan fill="${ACCENT}">io</tspan></text>`;
}

const art = {
  // NSIS header: small strip, top-right of the wizard.
  header: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="${BG}"/>
      ${glowDefs("g", w, 0, w)}<rect width="${w}" height="${h}" fill="url(#g)"/>
      ${wordmark(w / 2, h / 2 + 1, 22)}
      <rect x="0" y="${h - 2}" width="${w}" height="2" fill="${ACCENT}"/>
    </svg>`,

  // NSIS sidebar: tall panel on the welcome + finish pages.
  sidebar: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="${BG}"/>
      ${glowDefs("g", w / 2, h * 0.28, w * 1.1)}<rect width="${w}" height="${h}" fill="url(#g)"/>
      ${wordmark(w / 2, h * 0.3, 34)}
      <rect x="${w / 2 - 22}" y="${h * 0.3 + 30}" width="44" height="3" rx="1.5" fill="${ACCENT}"/>
      <text x="${w / 2}" y="${h * 0.3 + 56}" text-anchor="middle" font-family="${FONT}"
        font-size="11" fill="#9ca3af">Your films, series &amp; live TV</text>
      <rect x="0" y="${h - 3}" width="${w}" height="3" fill="${ACCENT}"/>
    </svg>`,

  // WiX (MSI) top banner.
  banner: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="${BG}"/>
      ${glowDefs("g", w * 0.12, h / 2, w * 0.5)}<rect width="${w}" height="${h}" fill="url(#g)"/>
      ${wordmark(24, h / 2 + 1, 26, "start")}
      <rect x="0" y="${h - 2}" width="${w}" height="2" fill="${ACCENT}"/>
    </svg>`,

  // WiX (MSI) welcome background.
  dialog: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="${BG}"/>
      ${glowDefs("g", w * 0.28, h * 0.35, w * 0.7)}<rect width="${w}" height="${h}" fill="url(#g)"/>
      ${wordmark(w * 0.28, h * 0.4, 54)}
      <rect x="${w * 0.28 - 34}" y="${h * 0.4 + 44}" width="68" height="4" rx="2" fill="${ACCENT}"/>
      <text x="${w * 0.28}" y="${h * 0.4 + 74}" text-anchor="middle" font-family="${FONT}"
        font-size="14" fill="#9ca3af">Films, series &amp; live TV — your way</text>
    </svg>`,
};

// Square app icon (also the source for `tauri icon`).
const iconSvg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <rect width="${s}" height="${s}" rx="${s * 0.19}" fill="${BG}"/>
    ${glowDefs("g", s / 2, s * 0.35, s * 0.75)}<rect width="${s}" height="${s}" rx="${s * 0.19}" fill="url(#g)"/>
    ${wordmark(s / 2, s / 2, s * 0.29)}
  </svg>`;

async function main() {
  mkdirSync("build", { recursive: true });
  mkdirSync("src-tauri/installer", { recursive: true });

  console.log("Generating app icon…");
  const png = await sharp(Buffer.from(iconSvg(1024))).png().toBuffer();
  writeFileSync("build/icon-1024.png", png);
  console.log("  ✓ build/icon-1024.png");

  console.log("Generating installer artwork…");
  await svgToBmp(art.header(150, 57), 150, 57, "src-tauri/installer/header.bmp");
  await svgToBmp(art.sidebar(164, 314), 164, 314, "src-tauri/installer/sidebar.bmp");
  await svgToBmp(art.banner(493, 58), 493, 58, "src-tauri/installer/banner.bmp");
  await svgToBmp(art.dialog(493, 312), 493, 312, "src-tauri/installer/dialog.bmp");
}

main().catch((e) => {
  console.error("Installer asset generation failed:", e);
  process.exit(1);
});
