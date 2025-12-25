import { scale, verticalScale } from "@/utils/styling";

export const colors = {
  primary: "#facc15",
  primaryLight: "#fef08a",
  primaryDark: "#eab308",
  text: "#292524",
  white: "#fff",
  black: "#000",
  rose: "#ef4444",
  otherBubble: "#FFF1BF",
  myBubble: "#FFE1CC",
  green: "#16a34a",
  neutral50: "#fafaf9",
  neutral100: "#f5f5f4",
  neutral200: "#e7e5e4",
  neutral300: "#d6d3d1",
  neutral350: "#CCCCCC",
  neutral400: "#a8a29e",
  neutral500: "#78716c",
  neutral600: "#57534e",
  neutral700: "#44403c",
  neutral800: "#292524",
  neutral900: "#1c1917",
  electricTeal: "#00ffc8",
  aquaGlow: "#00e4ff",
  deepCharcoal: "#0a0a0a",
  vibrantCoral: "#ff3366",
  pulseGradientStart: "#00ffc8",
  pulseGradientEnd: "#00e4ff",
  lightSky: "#0ea5e9",
  mintGlow: "#00c4b4",
  sunriseCoral: "#f97316",
  inkText: "#0f172a",
  cloudWhite: "#f8fafc",
  doveGray: "#f1f5f9",
  slate: "#475569",
};

export const brandPalette = {
  dark: {
    background: "#020202",
    surface: "#111827",
    border: "rgba(0,255,200,0.15)",
    textPrimary: "#f8fafc",
    textSecondary: "#e5e5e5",
    accentPrimary: "#00ffc8",
    accentSecondary: "#00e4ff",
    accentWarm: "#ff3366",
    accentGradient: ['#00ffc8', '#00e4ff'],
    shadowAccent: "rgba(0,255,200,0.25)",
    panel: 'rgba(24, 24, 24, 1)',
    cardBackground: "rgb(33,33,33)",
    cardBackground2: "rgba(14,165,233,0.25)"
  },

  light: {
    background: "#f8fafc",
    surface: "#f1f5f9",
    border: "rgba(15,118,110,0.18)",
    textPrimary: "#020202",
    textSecondary: "#475569",
    accentPrimary: "#0ea5e9",
    accentSecondary: "#00e4ff",
    accentGradient: ['#00ffc8', '#00e4ff'],
    accentWarm: "#f97316",
    shadowAccent: "rgba(14,165,233,0.25)",
    panel: "rgb(248, 248, 248)",
    cardBackground: "#f1f5f9",
    cardBackground2: "#f1f5f9"
  },
};

export const themes = {
  dark: {
    mode: "dark" as const,
    colors: brandPalette.dark,
  },
  light: {
    mode: "light" as const,
    colors: brandPalette.light,
  },
};

export const spacingX = {
  _3: scale(3),
  _5: scale(5),
  _7: scale(7),
  _10: scale(10),
  _12: scale(12),
  _15: scale(15),
  _20: scale(20),
  _25: scale(25),
  _30: scale(30),
  _35: scale(35),
  _40: scale(40),
};

export const spacingY = {
  _5: verticalScale(5),
  _7: verticalScale(7),
  _10: verticalScale(10),
  _12: verticalScale(12),
  _15: verticalScale(15),
  _17: verticalScale(17),
  _20: verticalScale(20),
  _25: verticalScale(25),
  _30: verticalScale(30),
  _35: verticalScale(35),
  _40: verticalScale(40),
  _50: verticalScale(50),
  _60: verticalScale(60),
};

export const radius = {
  _3: verticalScale(3),
  _6: verticalScale(6),
  _10: verticalScale(10),
  _12: verticalScale(12),
  _15: verticalScale(15),
  _17: verticalScale(17),
  _20: verticalScale(20),
  _30: verticalScale(30),
  _40: verticalScale(40),
  _50: verticalScale(50),
  _60: verticalScale(60),
  _70: verticalScale(70),
  _80: verticalScale(80),
  _90: verticalScale(90),
  full: 200,
};

export const images = [
  require('../assets/images/botImages/yellow.png'),
  require('../assets/images/botImages/blue.png'),
  require('../assets/images/botImages/red.png'),
  require('../assets/images/botImages/blue-2.png'),
  require('../assets/images/botImages/gray.png'),
];
