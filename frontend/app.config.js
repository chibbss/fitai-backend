
export default {
    expo: {
        name: "fit.ai",
        slug: "fit.ai",
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
            }

        },
    },
};