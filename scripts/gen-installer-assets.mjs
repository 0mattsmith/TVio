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

/**
 * Supersampling factor. NSIS/WiX fix these bitmaps at exact pixel sizes, so we
 * can't ship larger art — instead every asset is DRAWN at SS× (all coordinates
 * scaled, not just the canvas) and downsampled with Lanczos. Note that sharp's
 * `density` option can't do this for us: these SVGs carry absolute width/height,
 * so the renderer honours them and density is ignored.
 */
const SS = 4;

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

/** Renders an already-supersampled SVG down to the exact BMP size. */
async function svgToBmp(svg, width, height, out) {
  const { data } = await sharp(Buffer.from(svg))
    .resize(width, height, { kernel: sharp.kernel.lanczos3, fit: "fill" })
    .flatten({ background: BG })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  writeFileSync(out, encodeBmp24(data, width, height));
  console.log(`  ✓ ${out}  (drawn at ${width * SS}x${height * SS}, downsampled)`);
}

// --- Artwork ----------------------------------------------------------------
function glow(id, cx, cy, r) {
  return `<defs><radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient></defs>`;
}

function wordmark(x, y, size, anchor = "middle") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle"
      font-family="${FONT}" font-weight="900" font-size="${size}" letter-spacing="${-size * 0.03}">
      <tspan fill="#ffffff">TV</tspan><tspan fill="${ACCENT}">io</tspan></text>`;
}

// Each takes the FINAL size plus the supersample factor, and scales everything.
const art = {
  // NSIS header strip (top-right of the wizard). Only 150x57 and stretched by
  // Windows at >100% scaling, so: big type, thick accent, no hairlines.
  header: (w, h, s) => {
    const W = w * s, H = h * s;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${BG}"/>
      ${glow("g", W, 0, W)}<rect width="${W}" height="${H}" fill="url(#g)"/>
      ${wordmark(W / 2, H / 2 - 2 * s, 32 * s)}
      <rect x="0" y="${H - 4 * s}" width="${W}" height="${4 * s}" fill="${ACCENT}"/>
    </svg>`;
  },

  // NSIS sidebar (welcome + finish pages).
  sidebar: (w, h, s) => {
    const W = w * s, H = h * s;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${BG}"/>
      ${glow("g", W / 2, H * 0.28, W * 1.1)}<rect width="${W}" height="${H}" fill="url(#g)"/>
      ${wordmark(W / 2, H * 0.3, 44 * s)}
      <rect x="${W / 2 - 28 * s}" y="${H * 0.3 + 38 * s}" width="${56 * s}" height="${5 * s}" rx="${2.5 * s}" fill="${ACCENT}"/>
      <text x="${W / 2}" y="${H * 0.3 + 66 * s}" text-anchor="middle" font-family="${FONT}"
        font-weight="600" font-size="${13 * s}" fill="#cbd5d5">Films, series &amp; live TV</text>
      <rect x="0" y="${H - 5 * s}" width="${W}" height="${5 * s}" fill="${ACCENT}"/>
    </svg>`;
  },

  // WiX (MSI) top banner.
  banner: (w, h, s) => {
    const W = w * s, H = h * s;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${BG}"/>
      ${glow("g", W * 0.12, H / 2, W * 0.5)}<rect width="${W}" height="${H}" fill="url(#g)"/>
      ${wordmark(24 * s, H / 2, 28 * s, "start")}
      <rect x="0" y="${H - 2 * s}" width="${W}" height="${2 * s}" fill="${ACCENT}"/>
    </svg>`;
  },

  // WiX (MSI) welcome background.
  dialog: (w, h, s) => {
    const W = w * s, H = h * s;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${BG}"/>
      ${glow("g", W * 0.28, H * 0.35, W * 0.7)}<rect width="${W}" height="${H}" fill="url(#g)"/>
      ${wordmark(W * 0.28, H * 0.4, 56 * s)}
      <rect x="${W * 0.28 - 36 * s}" y="${H * 0.4 + 46 * s}" width="${72 * s}" height="${4 * s}" rx="${2 * s}" fill="${ACCENT}"/>
      <text x="${W * 0.28}" y="${H * 0.4 + 76 * s}" text-anchor="middle" font-family="${FONT}"
        font-size="${14 * s}" fill="#9ca3af">Films, series &amp; live TV — your way</text>
    </svg>`;
  },
};

// The app icon is the shared canonical mark (see scripts/brand.mjs), so the
// desktop exe/taskbar icon is pixel-identical to the Android launcher and the
// PWA favicon rather than a separately hand-tuned near-copy.
import { iconSvg } from "./brand.mjs";

async function main() {
  mkdirSync("build", { recursive: true });
  mkdirSync("src-tauri/installer", { recursive: true });

  console.log("Generating app icon…");
  writeFileSync("build/icon-1024.png", await sharp(Buffer.from(iconSvg(1024))).png().toBuffer());
  console.log("  ✓ build/icon-1024.png");

  console.log(`Generating installer artwork (supersampled ${SS}x)…`);
  await svgToBmp(art.header(150, 57, SS), 150, 57, "src-tauri/installer/header.bmp");
  await svgToBmp(art.sidebar(164, 314, SS), 164, 314, "src-tauri/installer/sidebar.bmp");
  await svgToBmp(art.banner(493, 58, SS), 493, 58, "src-tauri/installer/banner.bmp");
  await svgToBmp(art.dialog(493, 312, SS), 493, 312, "src-tauri/installer/dialog.bmp");
}

main().catch((e) => {
  console.error("Installer asset generation failed:", e);
  process.exit(1);
});
