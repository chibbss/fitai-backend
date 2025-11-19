
export default {
    expo: {
        name: "fit-chat",
        slug: "fit-chat",
        version: "1.0.0",
        orientation: "portrait",
        icon: "./assets/images/icon.png",
        scheme: "fitai",
        userInterfaceStyle: "automatic",
        newArchEnabled: true,
        ios: {
            supportsTablet: true,
            bundleIdentifier: "com.eochi.fitai",
            associatedDomains: ["applinks:fitai.app"]
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
            edgeToEdgeEnabled: true,
            predictiveBackGestureEnabled: false,
            usesCleartextTraffic: true,
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
            reactCompiler: true
        },
        extra: {
            // Render deployment URL - Update EXPO_PUBLIC_API_URL in .env if you need to override
            apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://fitai-api.onrender.com',
        },
    },
};