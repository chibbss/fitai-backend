import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';
import BackButton from '@/components/BackButton';
import Typo from '@/components/Typo';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { verticalScale } from '@/utils/styling';
import * as Icons from 'phosphor-react-native';

interface SettingsItem {
    id: string;
    label: string;
    icon: keyof typeof Icons;
    subtitle?: string;
    onPress?: () => void;
}

const Settings = () => {
    const router = useRouter();
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
        Alert.alert(
            'Log out',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log out',
                    style: 'destructive',
                    onPress: async () => {
                        await supabase.auth.signOut();
                        router.replace('/welcome');
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
                style={styles.settingsItem}
                onPress={item.onPress}
                activeOpacity={0.7}
            >
                <View style={styles.iconContainer}>
                    <IconComponent size={22} color={colors.white} weight="regular" />
                </View>

                <View style={styles.itemContent}>
                    <Typo
                        size={16}
                        color={colors.white}
                        fontWeight="400"
                    >
                        {item.label}
                    </Typo>

                    {item.subtitle && (
                        <Typo
                            size={14}
                            color={colors.neutral400}
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
                color={colors.white}
                fontWeight="600"
                style={styles.sectionHeader}
            >
                {title}
            </Typo>

            <View style={styles.sectionContainer}>
                {items.map(renderSettingsItem)}
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/*Header*/}
            <View style={styles.header}>
                <BackButton iconSize={24} color={colors.white} />
                <Typo size={28} color={colors.white} fontWeight="700" style={styles.headerTitle}>
                    Settings
                </Typo>
                <View style={{ width: 40 }} /> {/* Spacer for centering */}
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
                    style={styles.logoutButton}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                >
                    <View style={styles.iconContainer}>
                        <Icons.SignOut size={22} color='red' weight="regular" />
                    </View>
                    <Typo
                        size={16}
                        color='red'
                        fontWeight="400"
                    >
                        Log out
                    </Typo>
                </TouchableOpacity>

            </ScrollView>
        </SafeAreaView>
    )
}

export default Settings;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.neutral900
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
        backgroundColor: colors.neutral900,
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
        backgroundColor: colors.neutral900,
        borderRadius: radius._12,
        overflow: 'hidden',
    },
    settingsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._15,
        paddingHorizontal: spacingX._15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
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
        backgroundColor: colors.neutral900,
        borderRadius: radius._12,
    },
});