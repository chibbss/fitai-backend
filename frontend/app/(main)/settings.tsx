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
                console.error('Error fetching user data:', error);
            }
        };

        fetchUserData();
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
                            router.replace('/welcome');
                        } catch (error) {
                            logger.error('Logout error:', error);
                            // Still navigate even if sign out fails
                            router.replace('/welcome');
                        }
                    },
                },
            ]
        );
    };

    const handleItemPress = (itemId: string) => {
        // Placeholder for future navigation
        console.log('Settings item pressed:', itemId);
        // You can add navigation here later
    };

    // My FitAI section
    const myFitAISection: SettingsItem[] = [
        {
            id: 'personalization',
            label: 'Personalization',
            icon: 'User',
            onPress: () => handleItemPress('personalization'),
        },
    ];

    // Account section
    const accountSection: SettingsItem[] = [
        {
            id: 'name',
            label: 'Name',
            icon: 'User',
            subtitle: userName || 'Not set',
            onPress: () => handleItemPress('name'),
        },
        {
            id: 'email',
            label: 'Email',
            icon: 'Envelope',
            subtitle: userEmail,
            onPress: () => handleItemPress('email'),
        },
        {
            id: 'phone',
            label: 'Phone number',
            icon: 'Phone',
            subtitle: phoneNumber || 'Not set',
            onPress: () => handleItemPress('phone'),
        },
    ];

    //General section
    const generalSection: SettingsItem[] = [
        {
            id: 'general',
            label: 'General',
            icon: 'Gear',
            onPress: () => router.push('/general' as any),
        },
        {
            id: 'voice',
            label: 'Voice',
            icon: 'Waveform',
            onPress: () => handleItemPress('voice'),
        },
        {
            id: 'security',
            label: 'Security',
            icon: 'Lock',
            onPress: () => handleItemPress('security'),
        },
        {
            id: 'about',
            label: 'About',
            icon: 'Info',
            onPress: () => handleItemPress('about'),
        },
    ];

    const renderSettingsItem = (item: SettingsItem) => {
        const IconComponent = Icons[item.icon] as React.ComponentType<any>;
        return (
            <TouchableOpacity
                key={item.id}
                style={[styles.settingsItem, { borderBottomColor: themeColors.border }]}
                onPress={item.onPress}
                activeOpacity={0.7}
            >
                <View style={styles.iconContainer}>
                    <IconComponent size={22} color={themeColors.accentPrimary} weight="regular" />
                </View>

                <View style={styles.itemContent}>
                    <Typo
                        size={16}
                        color={themeColors.textPrimary}
                        fontWeight="400"
                    >
                        {item.label}
                    </Typo>

                    {item.subtitle && (
                        <Typo
                            size={14}
                            color={themeColors.textSecondary}
                            fontWeight="400"
                            style={styles.subtitle}
                        >
                            {item.subtitle}
                        </Typo>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderSection = (title: string, items: SettingsItem[]) => (
        <View style={styles.section}>
            <Typo
                size={13}
                color={themeColors.textSecondary}
                fontWeight="600"
                style={styles.sectionHeader}
            >
                {title}
            </Typo>

            <View style={styles.sectionContainer}>
                {items.map((item, index) => (
                    <View key={item.id} style={styles.itemWrapper}>
                        {renderSettingsItem(item)}
                    </View>
                ))}
            </View>
        </View>
    );

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
                            Settings
                        </Typo>
                        <View style={styles.placeholder} />
                    </View>

                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* My FitAI Section */}
                        {renderSection('My FitAI', myFitAISection)}

                        {/* Account Section */}
                        {renderSection('Account', accountSection)}

                        {/* General Section */}
                        {renderSection('General', generalSection)}

                        {/*LogOut Button*/}
                        <TouchableOpacity
                            style={[styles.logoutButton, { backgroundColor: themeColors.cardBackground }]}
                            onPress={handleLogout}
                            activeOpacity={0.7}
                        >
                            <View style={styles.iconContainer}>
                                <Icons.SignOut size={22} color={colors.rose} weight="regular" />
                            </View>
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
        // Remove border bottom to match calendar
    },
    backButton: {
        padding: spacingX._5,
    },
    placeholder: {
        width: 34,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: spacingY._30,
    },
    section: {
        marginTop: spacingY._20,
        paddingHorizontal: spacingX._20,
    },
    sectionHeader: {
        marginBottom: spacingY._10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sectionContainer: {
        // Remove the border and background - items will have their own
    },
    itemWrapper: {
        marginBottom: spacingY._12,
    },
    settingsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._15,
        paddingHorizontal: spacingX._15,
        borderRadius: radius._12,
        borderWidth: 1,
        // Remove borderBottomWidth - we're using marginBottom on wrapper instead
        // borderBottomColor will be set inline with themeColors.border
    },
    iconContainer: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacingX._15,
    },
    itemContent: {
        flex: 1,
        gap: 2,
    },
    subtitle: {
        marginTop: 2,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._15,
        paddingHorizontal: spacingX._15,
        marginTop: spacingY._20,
        marginHorizontal: spacingX._20,
        borderRadius: radius._12,
        borderWidth: 1,
        // borderColor will be set inline with themeColors.border
    },
});
