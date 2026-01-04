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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    (frontendEnv.parsed && frontendEnv.parsed.EXPO_PUBLIC_SUPABASE_URL);

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    (frontendEnv.parsed && frontendEnv.parsed.EXPO_PUBLIC_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('\n⚠️  WARNING: Supabase credentials are missing!');
    console.warn('Ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in your .env or EAS Secrets.\n');
}

module.exports = {
    name: "FitAI",
    slug: "fitAI",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "fitai",
    userInterfaceStyle: "automatic",
    newArchEnabled: false,

    privacy: "public",
    description: "Your AI-powered fitness coach",
    githubUrl: "https://github.com/chibbss/fitai-backend",

    ios: {
        supportsTablet: true,
        bundleIdentifier: "com.eochi.fitai",
        // associatedDomains: ["applinks:fitai.app"],

        buildNumber: "2",
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
        "expo-font"
    ],
    experiments: {
        typedRoutes: true,
        reactCompiler: false
    },
    extra: {
        apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://fitai-api.onrender.com',
        eas: {
            "projectId": "0c3a646a-eb41-4432-bba8-9092fc7e2c3d"
        },
        supabaseUrl,
        supabaseAnonKey,
        "router": {}
    },
    navigationBar: {
        backgroundColor: "#00000000",
        barStyle: "light-content"
    },
    updates: {
        "url": "https://u.expo.dev/0c3a646a-eb41-4432-bba8-9092fc7e2c3d"
    },
    runtimeVersion: {
        "policy": "appVersion"
    }
};