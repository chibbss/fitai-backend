const path = require('path');
const { config } = require('dotenv');

// Polyfills for Node.js < 20
if (!Array.prototype.toReversed) {
    Array.prototype.toReversed = function () {
        return [...this].reverse();
    };
}
if (!Array.prototype.toSorted) {
    Array.prototype.toSorted = function (compareFn) {
        return [...this].sort(compareFn);
    };
}
if (!Array.prototype.toSpliced) {
    Array.prototype.toSpliced = function (start, deleteCount, ...items) {
        const copy = [...this];
        copy.splice(start, deleteCount, ...items);
        return copy;
    };
}
if (!Array.prototype.with) {
    Array.prototype.with = function (index, value) {
        const copy = [...this];
        copy[index] = value;
        return copy;
    };
}

// Try to load from both frontend and root just in case
const fs = require('fs');
const envPath = path.join(__dirname, '.env');

const frontendEnv = config({ path: envPath, override: true });
const rootEnv = config({ path: path.join(__dirname, '../.env'), override: true });

// FALLBACK: Hardcode the values if they are still missing to unblock the build context
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    (frontendEnv.parsed && frontendEnv.parsed.EXPO_PUBLIC_SUPABASE_URL) ||
    'https://ltxehjhphbncgsjyqhzk.supabase.co';

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    (frontendEnv.parsed && frontendEnv.parsed.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eGVoamhwaGJuY2dzanlxaHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2OTU1MDAsImV4cCI6MjA3NjI3MTUwMH0.OG9XkGrWzHzcIkDQrY2ADzv_nAE36ysOZja8x-vZq6Y';

module.exports = {
    name: "FitAI",
    slug: "fitAI",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "fitai",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    privacy: "public",
    description: "Your AI-powered fitness coach",
    githubUrl: "https://github.com/chibbss/fitai-backend",

    ios: {
        supportsTablet: true,
        bundleIdentifier: "com.eochi.fitai",
        associatedDomains: ["applinks:fitai.app"],

        buildNumber: "1",
        config: {
            usesNonExemptEncryption: false
        },
        infoPlist: {

            NSUserTrackingUsageDescription: "This allows us to provide personalized fitness recommendations.",

        }
    },
    android: {
        adaptiveIcon: {
            backgroundColor: "#E6F4FE",
            foregroundImage: "./assets/images/android-icon-foreground.png",
            backgroundImage: "./assets/images/android-icon-background.png",
            monochromeImage: "./assets/images/android-icon-monochrome.png",
            softwareKeyboardLayoutMode: "pan"
        },
        package: "com.eochi.fitai",
        versionCode: 1,
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        usesCleartextTraffic: true,
        permissions: [

            "INTERNET",
            "ACCESS_NETWORK_STATE"
        ],
        intentFilters: [
            {
                action: "VIEW",
                autoVerify: true,
                data: [
                    {
                        scheme: "https",
                        host: "*.supabase.co",
                        pathPrefix: "/auth/v1/verify"
                    }
                ],
                category: ["BROWSABLE", "DEFAULT"]
            },
            {
                action: "VIEW",
                data: [
                    {
                        scheme: "fitai"
                    }
                ],
                category: ["BROWSABLE", "DEFAULT"]
            }
        ]
    },
    web: {
        output: "static",
        favicon: "./assets/images/favicon.png"
    },
    plugins: [
        "expo-router",
        [
            "expo-splash-screen",
            {
                image: "./assets/images/splash-icon.png",
                imageWidth: 200,
                resizeMode: "contain",
                backgroundColor: "#ffffff",
                dark: {
                    backgroundColor: "#000000"
                }
            }
        ],
        "expo-video",
        "expo-font",
        "expo-web-browser"
    ],
    experiments: {
        typedRoutes: true,
        reactCompiler: true
    },
    extra: {

        apiUrl: 'https://fitai-api.onrender.com',
        eas: {
            "projectId": "0c3a646a-eb41-4432-bba8-9092fc7e2c3d"
        },
        supabaseUrl,
        supabaseAnonKey,
        "router": {}
    },
};