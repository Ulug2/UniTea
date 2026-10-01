/**
 * Poppins has no Cyrillic glyphs. On iOS/Android the OS falls back to its own
 * sans-serif for Russian/Kazakh text, but a browser falls back to its default
 * serif, so preview captures of Cyrillic posts looked nothing like the app.
 * These @font-face rules add a sans-serif face under each Poppins family name,
 * limited to the Cyrillic ranges (incl. Kazakh letters), so Latin text keeps
 * Poppins and Cyrillic gets Helvetica/Arial — the look of the app on a phone.
 */
const CYRILLIC_RANGES = "U+0400-052F, U+1C80-1C88, U+2DE0-2DFF, U+A640-A69F";

const REGULAR_LOCALS = [
  "Helvetica Neue",
  "Helvetica",
  "Arial",
  "Liberation Sans",
  "Noto Sans",
  "DejaVu Sans",
];
const BOLD_LOCALS = [
  "Helvetica Neue Bold",
  "Helvetica Bold",
  "Arial Bold",
  "Liberation Sans Bold",
  "Noto Sans Bold",
  "DejaVu Sans Bold",
];

const FAMILIES: Array<[family: string, locals: string[]]> = [
  ["Poppins_400Regular", REGULAR_LOCALS],
  ["Poppins_500Medium", REGULAR_LOCALS],
  ["Poppins_600SemiBold", BOLD_LOCALS],
  ["Poppins_700Bold", BOLD_LOCALS],
];

export function buildCyrillicFallbackCss(): string {
  return FAMILIES.map(
    ([family, locals]) =>
      `@font-face{font-family:"${family}";src:${locals
        .map((name) => `local("${name}")`)
        .join(",")};unicode-range:${CYRILLIC_RANGES};}`,
  ).join("\n");
}

const STYLE_ID = "preview-cyrillic-font-fallback";

/** Web only: installs the fallback faces once. No-op where there is no DOM. */
export function installCyrillicFontFallback(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildCyrillicFallbackCss();
  document.head.appendChild(style);
}
