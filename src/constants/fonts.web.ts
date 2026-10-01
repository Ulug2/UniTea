/**
 * Web variant of fonts.ts for the post card preview. Browsers fall back to a
 * serif font for characters Poppins lacks (Cyrillic), unlike phones, which
 * use their system font. react-native-web expands "System" to the Apple
 * system stack (-apple-system, BlinkMacSystemFont, …), so on a Mac
 * Russian/Kazakh text renders in SF Pro exactly as on an iPhone, while Latin
 * text stays Poppins.
 */
export const fonts = {
  regular: "Poppins_400Regular, System",
  medium: "Poppins_500Medium, System",
  semiBold: "Poppins_600SemiBold, System",
  bold: "Poppins_700Bold, System",
} as const;
