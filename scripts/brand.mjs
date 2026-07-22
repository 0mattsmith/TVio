// The one canonical TVio mark. Every surface — Android launcher, desktop app,
// PWA favicon — draws from this so they're pixel-identical rather than three
// slightly-different hand-tuned copies that drift apart.

export const BG = "#0a0a0a";
export const ACCENT = "#14b8a6";
export const FONT = "Roboto, Inter, Arial, Helvetica, sans-serif";

/** Teal radial glow used behind the wordmark. */
export const glow = (id, cx, cy, r) =>
  `<defs><radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
     <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.30"/>
     <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
   </radialGradient></defs>`;

/** Bold white "TV" with a smaller teal "io" tucked in so it overlaps slightly. */
export const wordmark = (cx, cy, size) => {
  const io = size * 0.52;
  return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
      font-family="${FONT}" font-weight="900" font-size="${size}" letter-spacing="${-size * 0.04}">
      <tspan fill="#ffffff">TV</tspan><tspan fill="${ACCENT}" font-size="${io}" dx="${-io * 0.14}">io</tspan>
    </text>`;
};

/** Square app icon: dark tile, teal glow, wordmark. `radius` fraction of size. */
export const iconSvg = (n, radius = 0.2) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}">
    ${glow("g", n / 2, n * 0.34, n * 0.8)}
    <rect width="${n}" height="${n}" rx="${n * radius}" fill="${BG}"/>
    <rect width="${n}" height="${n}" rx="${n * radius}" fill="url(#g)"/>
    ${wordmark(n / 2, n / 2, n * 0.32)}
  </svg>`;

/** The adaptive-icon foreground: just the wordmark on transparency. */
export const foregroundSvg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">
    ${wordmark(n / 2, n / 2, n * 0.26)}
  </svg>`;

/** The adaptive-icon background: dark tile + glow, no wordmark. */
export const backgroundSvg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">
    ${glow("g", n / 2, n * 0.34, n * 0.8)}
    <rect width="${n}" height="${n}" fill="${BG}"/>
    <rect width="${n}" height="${n}" fill="url(#g)"/>
  </svg>`;
