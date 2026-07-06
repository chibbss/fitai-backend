import LogTrainingSheet from '@/components/LogTrainingSheet';
import { useTheme } from '@/context/ThemeContext';
import { Tabs } from "expo-router";
import {
    CalendarBlank,
    ChatCircle,
    ListBullets,
    Plus,
    User
} from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_HEIGHT = 60;

export default function MainLayout() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const tabBarHeight = TAB_HEIGHT + insets.bottom;
    const [sheetOpen, setSheetOpen] = useState(false);

    return (
        <>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        backgroundColor: colors.surface,
                        borderTopColor: colors.border,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        height: tabBarHeight,
                        paddingBottom: insets.bottom,
                        paddingTop: 8,
                        elevation: 0,
                    },
                    tabBarActiveTintColor: colors.accent,
                    tabBarInactiveTintColor: colors.textMuted,
                    tabBarLabelStyle: {
                        fontSize: 11,
                        fontWeight: '600',
                        marginBottom: Platform.OS === 'ios' ? 0 : 4,
                    },
                }}
            >
                <Tabs.Screen
                    name="chatscreen"
                    options={{
                        title: 'Coach',
                        tabBarIcon: ({ color, focused }) => (
                            <ChatCircle color={color} size={24} weight={focused ? 'fill' : 'regular'} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="stats"
                    options={{
                        title: 'Stats',
                        tabBarIcon: ({ color, focused }) => (
                            <CalendarBlank color={color} size={24} weight={focused ? 'fill' : 'regular'} />
                        ),
                    }}
                />

                {/* Center "+" — custom button, never navigates */}
                <Tabs.Screen
                    name="log-training"
                    options={{
                        title: '',
                        tabBarButton: () => (
                            <TouchableOpacity
                                style={styles.plusWrapper}
                                activeOpacity={0.85}
                                onPress={() => setSheetOpen(true)}
                                accessibilityLabel="Log Training"
                                accessibilityRole="button"
                            >
                                <View style={[styles.plusCircle, { backgroundColor: colors.accent }]}>
                                    <Plus color={colors.textOnAccent} size={26} weight="bold"

                                    />
                                </View>
                            </TouchableOpacity>
                        ),
                    }}
                />

                <Tabs.Screen
                    name="log"
                    options={{
                        title: 'Log',
                        tabBarIcon: ({ color, focused }) => (
                            <ListBullets color={color} size={24} weight={focused ? 'fill' : 'regular'} />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="profile"
                    options={{
                        title: 'Profile',
                        tabBarIcon: ({ color, focused }) => (
                            <User color={color} size={24} weight={focused ? 'fill' : 'regular'} />
                        ),
                    }}
                />

                {/* Legacy screens — still routable, hidden from tab bar */}
                <Tabs.Screen name="onboarding" options={{ href: null, tabBarStyle: { display: 'none' } }} />
                <Tabs.Screen name="settings" options={{ href: null }} />
                <Tabs.Screen name="calendar" options={{ href: null }} />
                <Tabs.Screen name="insights" options={{ href: null }} />
                {/* 
                <Tabs.Screen
                    name="calendar"
                    options={{

                        title: 'Calendar',
                        tabBarIcon: ({ color, focused }) => (
                            <Lightbulb color={color} size={24} weight={focused ? 'fill' : 'regular'} />
                        )
                    }}
                />
                <Tabs.Screen
                    name="insights"
                    options={{

                        title: 'Insights',
                        tabBarIcon: ({ color, focused }) => (
                            <Lightbulb color={color} size={24} weight={focused ? 'fill' : 'regular'} />
                        )
                    }}
                />
                */}
                <Tabs.Screen name="workout-log" options={{ href: null }} />
                <Tabs.Screen name="general" options={{ href: null }} />

            </Tabs>
            <LogTrainingSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
        </>
    )
}

const styles = StyleSheet.create({
    plusWrapper: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -20,        // lifts it above the tab bar
    },
    plusCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#14B8A6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 8,
    },
});