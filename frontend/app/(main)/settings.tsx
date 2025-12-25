import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';
import Typo from '@/components/Typo';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { verticalScale } from '@/utils/styling';
import * as Icons from 'phosphor-react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { useTheme } from '@/context/ThemeContext';
import { Platform, Dimensions } from 'react-native';
import { alert } from '@/utils/alert';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/utils/logger';
import { workoutApi } from '@/utils/api';

interface SettingsItem {
    id: string;
    label: string;
    icon: keyof typeof Icons;
    subtitle?: string;
    onPress?: () => void;
}

const Settings = () => {
    const router = useRouter();
    const { colors: themeColors } = useTheme();
    const { signOut, user } = useAuth();
    const [userName, setUserName] = useState<string>('');
    const [userEmail, setUserEmail] = useState<string>('');
    const [phoneNumber, setPhoneNumber] = useState<string>('');
    const [totalWorkouts, setTotalWorkouts] = useState<number>(0);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (user && !error) {
                    const name = user.user_metadata?.name || user.email?.split('@')[0] || 'User';
                    setUserName(name);
                    setUserEmail(user.email || '');
                    // Phone number would come from user metadata or backend profile
                    // For now, you can fetch from backend if stored there
                }
            } catch (error) {
                logger.error('Error fetching user data:', error);
            }
        };

        const fetchWorkoutStats = async () => {
            try {
                // Get a recent workout session to fetch stats
                const calendarData = await workoutApi.getCalendar() as { items?: Array<{ session_id: string }> };
                if (calendarData?.items && calendarData.items.length > 0) {
                    const stats = await workoutApi.getStats(calendarData.items[0].session_id) as any;
                    if (stats?.stats?.consistency?.total_sessions) {
                        setTotalWorkouts(stats.stats.consistency.total_sessions);
                    }
                }
            } catch (error) {
                // Silently fail - stats are optional
                logger.warn('Could not fetch workout stats for profile:', error);
            }
        };

        fetchUserData();
        fetchWorkoutStats();
    }, []);

    const handleLogout = async () => {
        alert.alert(
            'Log out',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log out',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // Don't clear cache - data will persist and be refreshed from backend on next login
                            // This ensures data is available immediately on next login
                            await signOut();
                            router.replace('/welcome' as any);
                        } catch (error) {
                            logger.error('Logout error:', error);
                            // Still navigate even if sign out fails
                            router.replace('/welcome' as any);
                        }
                    },
                },
            ]
        );
    };

    const handleItemPress = (itemId: string) => {
        // Placeholder for future navigation
        logger.log('Settings item pressed:', itemId);
        // You can add navigation here later
    };

    const handleComingSoon = (featureName: string) => {
        alert.info(`${featureName} will be available in the next update!`, 'Coming Soon');
    };

    // Account section (for display in profile card)
    const accountSection: SettingsItem[] = [
        
        {
            id: 'email',
            label: 'Email',
            icon: 'Envelope',
            subtitle: userEmail,
        },
        {
            id: 'phone',
            label: 'Phone number',
            icon: 'Phone',
            subtitle: phoneNumber || 'Not set',
        },
    ];

    // Settings section
    const settingsSection: SettingsItem[] = [
        {
            id: 'personalization',
            label: 'Personalization',
            icon: 'User',
            onPress: () => handleComingSoon('Personalization'),
        },
        {
            id: 'general',
            label: 'General',
            icon: 'Gear',
            onPress: () => handleComingSoon('Feature'),
        },
        {
            id: 'notifications',
            label: 'Notifications',
            icon: 'Bell',
            onPress: () => handleComingSoon('Notifications'),
        },
        {
            id: 'voice',
            label: 'Voice',
            icon: 'Waveform',
            onPress: () => handleComingSoon('Voice'),
        },
         
        {
            id: 'about',
            label: 'About',
            icon: 'Info',
            onPress: () => handleComingSoon('About'),
        },
    ];

    const renderInfoItem = (item: SettingsItem, isFirst: boolean = false) => {
        const IconComponent = Icons[item.icon] as React.ComponentType<any>;
        return (
            <View
                key={item.id}
                style={[
                    styles.infoItem,
                    !isFirst && { borderTopWidth: 1, borderTopColor: themeColors.border }
                ]}
            >
                <IconComponent size={20} color={themeColors.accentPrimary} weight="regular" />
                <View style={styles.infoItemContent}>
                    <Typo
                        size={16}
                        color={themeColors.textPrimary}
                        fontWeight="400"
                    >
                        {item.subtitle || item.label}
                    </Typo>
                </View>
            </View>
        );
    };

    const renderSettingsItem = (item: SettingsItem) => {
        const IconComponent = Icons[item.icon] as React.ComponentType<any>;
        return (
            <TouchableOpacity
                key={item.id}
                style={[styles.settingsItem, { borderColor: themeColors.border, backgroundColor: themeColors.cardBackground }]}
                onPress={item.onPress}
                activeOpacity={0.7}
            >
                <IconComponent size={20} color={themeColors.accentPrimary} weight="regular" />
                <View style={styles.itemContent}>
                    <Typo
                        size={16}
                        color={themeColors.textPrimary}
                        fontWeight="400"
                    >
                        {item.label}
                    </Typo>
                </View>
                <Icons.CaretRight size={20} color={themeColors.textSecondary} weight="regular" />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
            <ScreenWrapper showPattern={false}>
                <View style={[styles.whiteBackground, { backgroundColor: themeColors.background }]}>
                    {/*Header*/}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={styles.backButton}
                        >
                            <Icons.CaretLeft size={26} color={themeColors.textPrimary} weight="bold" />
                        </TouchableOpacity>
                        <Typo size={24} fontWeight="700" color={themeColors.textPrimary}>
                            Profile
                        </Typo>
                        <View style={styles.placeholder} />
                    </View>

                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Profile Card */}
                        <View style={[styles.profileCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
                            <View style={[styles.profileIconContainer, { borderColor: themeColors.accentPrimary }]}>
                                <Icons.User size={60} color={themeColors.accentPrimary} weight="fill" />
                            </View>
                            <Typo size={24} fontWeight="700" color={themeColors.textPrimary} style={styles.profileName}>
                                {userName || 'User'}
                            </Typo>
                            <View style={styles.statsRow}>
                                <Icons.Trophy size={16} color={themeColors.accentPrimary} weight="fill" />
                                <Typo size={14} color={themeColors.textPrimary} fontWeight="400">
                                    Workouts Completed: {totalWorkouts}
                                </Typo>
                            </View>
                            
                            {/* Account Information inside Profile Card */}
                            <View style={[styles.accountInfoContainer, { borderTopWidth: 1, borderTopColor: themeColors.border }]}>
                                {accountSection.map((item, index) => renderInfoItem(item, index === 0))}
                            </View>
                        </View>

                        {/* Settings Options */}
                        <View style={styles.section}>
                            <View style={styles.sectionContainer}>
                                {settingsSection.map((item) => renderSettingsItem(item))}
                            </View>
                        </View>

                        {/*LogOut Button*/}
                        <TouchableOpacity
                            style={[styles.logoutButton, { borderColor: themeColors.border }]}
                            onPress={handleLogout}
                            activeOpacity={0.7}
                        >
                            <Icons.SignOut size={20} color={colors.rose} weight="regular" />
                            <Typo
                                size={16}
                                color={colors.rose}
                                fontWeight="400"
                            >
                                Log out
                            </Typo>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </ScreenWrapper>
        </SafeAreaView>
    )
}


const SettingsComponent = Settings;

export default function ProtectedSettings() {
    return (
        <AuthGuard>
            <SettingsComponent />
        </AuthGuard>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    whiteBackground: {
        ...StyleSheet.absoluteFillObject,
        paddingTop: Platform.OS === 'ios' ? Dimensions.get('window').height * 0.06 : 40,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
    },
    backButton: {
        padding: spacingX._5,
    },
    placeholder: {
        width: 34,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: spacingY._30,
    },
    
    profileCard: {
        alignItems: 'center',
        paddingVertical: spacingY._30,
        paddingHorizontal: spacingX._20,
        marginHorizontal: spacingX._20,
        marginTop: spacingY._20,
        borderRadius: radius._20,
        borderWidth: 1,
    },
    profileIconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 3,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacingY._15,
        backgroundColor: 'transparent',
    },
    profileName: {
        marginBottom: spacingY._10,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10,
        marginBottom: spacingY._20,
    },
    accountInfoContainer: {
        width: '100%',
        marginTop: spacingY._5,
        paddingTop: spacingY._10,
    },
    section: {
        marginTop: spacingY._25,
        paddingHorizontal: spacingX._20,
    },
    sectionContainer: {
        gap: spacingY._12,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._10,
        gap: spacingX._15,
    },
    infoItemContent: {
        flex: 1,
    },
    settingsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._15,
        paddingHorizontal: spacingX._15,
        borderRadius: radius._12,
        borderWidth: 1,
        gap: spacingX._15,
    },
    itemContent: {
        flex: 1,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._15,
        paddingHorizontal: spacingX._15,
        marginTop: spacingY._30,
        marginHorizontal: spacingX._20,
        borderRadius: radius._12,
        gap: spacingX._15,
    },
});
