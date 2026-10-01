/**
 * The app's font families (Poppins, loaded in src/app/_layout.tsx). On
 * iOS/Android, text Poppins can't draw — e.g. Russian/Kazakh, which Poppins
 * has no glyphs for — falls back to the phone's system font automatically.
 * fonts.web.ts reproduces that fallback for the web post card preview.
 */
export const fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semiBold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
} as const;
