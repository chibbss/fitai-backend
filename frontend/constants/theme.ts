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
    // ---- Surfaces ----
    background: "#000000",       // app background — true black, per mockups
    surface: "#121214",          // elevated surfaces: headers, bottom sheets
    card: "#1A1A1C",             // cards & list rows
    cardElevated: "#222226",     // nested blocks: set rows, inputs sitting on a card
    input: "#1C1C1E",            // text input fields
    border: "rgba(255,255,255,0.07)",
    borderStrong: "rgba(255,255,255,0.12)",
    overlay: "rgba(0,0,0,0.6)",  // dim behind modals/sheets

    // ---- Text ----
    textPrimary: "#FFFFFF",
    textSecondary: "#9BA1AC",    // subtitles ("Always here to help")
    textMuted: "#6B7280",        // captions, hints
    textOnAccent: "#04140F",     // dark text on teal buttons

    // ---- Accent (teal) ----
    accent: "#14B8A6",           // primary CTAs, active states
    accentBright: "#2DD4BF",     // highlights, user bubble, the "+" button
    accentDim: "rgba(20,184,166,0.15)", // faint teal fill for selected cards
    accentGradient: ["#16C5B0", "#2DD4BF"],

    // ---- Semantic ----
    gold: "#FBBF24",   // PRs, trophies
    streak: "#F97316", // streak flame
    danger: "#EF4444", // critical / delete
    info: "#3B82F6",   // blue accents
    purple: "#8B5CF6", // purple accents

    // ---- Chart palette ----
    chart: {
      teal: "#2DD4BF",
      blue: "#3B82F6",
      orange: "#F59E0B",
      purple: "#8B5CF6",
      grid: "rgba(255,255,255,0.08)",
    },

    // ---- Legacy aliases (kept so existing screens don't break) ----
    accentPrimary: "#14B8A6",
    accentSecondary: "#2DD4BF",
    accentWarm: "#F97316",
    shadowAccent: "rgba(20,184,166,0.25)",
    panel: "#121214",
    cardBackground: "#1A1A1C",
    cardBackground2: "rgba(20,184,166,0.12)",
  },

  light: {
    // ---- Surfaces ----
    background: "#F8FAFC",
    surface: "#FFFFFF",
    card: "#FFFFFF",
    cardElevated: "#F1F5F9",
    input: "#F1F5F9",
    border: "rgba(15,23,42,0.08)",
    borderStrong: "rgba(15,23,42,0.14)",
    overlay: "rgba(0,0,0,0.4)",

    // ---- Text ----
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    textOnAccent: "#04140F",

    // ---- Accent (teal) ----
    accent: "#14B8A6",
    accentBright: "#0D9488",
    accentDim: "rgba(20,184,166,0.12)",
    accentGradient: ["#14B8A6", "#2DD4BF"],

    // ---- Semantic ----
    gold: "#D97706",
    streak: "#EA580C",
    danger: "#DC2626",
    info: "#2563EB",
    purple: "#7C3AED",

    // ---- Chart palette ----
    chart: {
      teal: "#14B8A6",
      blue: "#2563EB",
      orange: "#D97706",
      purple: "#7C3AED",
      grid: "rgba(15,23,42,0.08)",
    },

    // ---- Legacy aliases ----
    accentPrimary: "#14B8A6",
    accentSecondary: "#2DD4BF",
    accentWarm: "#EA580C",
    shadowAccent: "rgba(20,184,166,0.25)",
    panel: "#FFFFFF",
    cardBackground: "#FFFFFF",
    cardBackground2: "rgba(20,184,166,0.10)",
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
