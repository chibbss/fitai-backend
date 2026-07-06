import { Dimensions, StyleSheet, Text, TouchableOpacity, View, ScrollView, KeyboardAvoidingView, Platform, Keyboard } from 'react-native'
import React, { useMemo, useState, useEffect } from 'react'
// @ts-ignore
import Hamburger from 'react-native-animated-hamburger';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSpring, FadeInLeft } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacingX, spacingY, brandPalette } from '@/constants/theme';
import * as Icons from 'phosphor-react-native';
import Typo from './Typo';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Input from './Input';
import { verticalScale } from '@/utils/styling';
import { useRouter, usePathname } from 'expo-router';
import { supabase } from "@/utils/supabase";
import { getAccentColor, getGradientColors } from '@/utils/settings';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/context/ThemeContext';
import { MOCK_MODE } from '@/utils/config';
import BugReportModal from './BugReportModal';


const { width } = Dimensions.get("window");
const screenHeight = Dimensions.get('screen').height;


interface MenuItem {
    id: string;
    label: string;
    icon: keyof typeof Icons;
}

const MAIN_MENU_ITEMS: MenuItem[] = [
    { id: 'home', label: 'Chat', icon: 'Chat' },
    { id: 'calendar', label: 'Calendar', icon: 'Calendar' },
    { id: 'workout-log', label: 'Workout Log', icon: 'Barbell' },
    { id: 'insights', label: 'Insights', icon: 'ChartLineUp' },
];

// Mock history items - will be replaced with real data later
const HISTORY_ITEMS = [
    { id: '1', title: 'Workout Plan Discussion', date: 'Today' },
    { id: '2', title: 'Nutrition Advice', date: 'Yesterday' },
    { id: '3', title: 'Running Form Tips', date: '2 days ago' },
    { id: '4', title: 'Recovery Strategies', date: '3 days ago' },
    { id: '5', title: 'Strength Training Basics', date: '1 week ago' },
    { id: '6', title: 'Cardio Workouts', date: '1 week ago' },
    { id: '7', title: 'Flexibility Routine', date: '2 weeks ago' },
];



const SlidingPanel = () => {
    const { colors: themeColors } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const translateX = useSharedValue(-width * 0.8);
    const overlayOpacity = useSharedValue(0);
    const insets = useSafeAreaInsets();
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();
    const pathname = usePathname(); // Add this line
    const [gradientColors, setGradientColors] = useState<[string, string]>(['#fafaf9', '#e7e5e4']);

    const [showBugReport, setShowBugReport] = useState(false);

    const [userName, setUserName] = useState<string>('User Name');
    const [userEmail, setUserEmail] = useState<string>('user@example.com');

    // Load accent color and generate gradient
    useFocusEffect(
        React.useCallback(() => {
            const loadAccentColor = async () => {
                const accentColor = await getAccentColor();
                setGradientColors(getGradientColors(accentColor));
            };
            loadAccentColor();
        }, [])
    );

    // Add useEffect to fetch user data (after state declarations):
    useEffect(() => {
        const fetchUserData = async () => {
            if (MOCK_MODE) {
                setUserName('Guest Athlete');
                setUserEmail('guest@fitai.com');
                return;
            }
            try {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (user && !error) {
                    const name = user.user_metadata?.name || user.email?.split('@')[0] || 'User';
                    setUserName(name);
                    setUserEmail(user.email || 'user@example.com');
                }
            } catch (error) {
                // Error fetching user data is non-critical, silently fail
            }
        };

        fetchUserData();
    }, []);

    const togglePanel = () => {
        const newState = !isOpen;
        setIsOpen(newState);

        // Dismiss keyboard when opening the menu
        if (newState) {
            Keyboard.dismiss();
        }

        //translateX.value = withTiming(newState ? 0 : -width * 0.8, { duration: 300 });
        translateX.value = withSpring(newState ? 0 : -width * 0.8, {
            damping: 20,
            stiffness: 90,
        });
        overlayOpacity.value = withTiming(newState ? 0.5 : 0, { duration: 300 });
    };

    const closePanel = () => {
        setIsOpen(false);
        //translateX.value = withTiming(-width * 0.8, { duration: 300 }); // Fix: Match panel width
        translateX.value = withSpring(-width * 0.8, {
            damping: 20,
            stiffness: 90,
        });

        overlayOpacity.value = withTiming(0, { duration: 300 });
        setSearchQuery('');
    };

    const panelStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const overlayStyle = useAnimatedStyle(() => ({
        opacity: overlayOpacity.value,
        pointerEvents: isOpen ? "auto" : "none",
    }));

    const handleMenuPress = (itemId: string) => {
        closePanel();

        switch (itemId) {
            case 'home':
                // If already on chatscreen, just close panel (no navigation needed)
                if (pathname === '/chatscreen') {
                    return;
                }
                // Otherwise, replace current screen with chatscreen to go back to existing conversation
                router.replace('/chatscreen' as any);
                break;
            case 'calendar':
                router.push('/calendar' as any);
                break;
            case 'workout-log':
                router.push('/workout-log' as any);
                break;
            case 'insights':
                router.push('/insights' as any);
                break;
            default:
                // Handle other menu items
                break;
        }
    };

    const handleHistoryPress = (itemId: string) => {
        // Handle history item press
        // Navigation will be added later
        closePanel();
    };

    // Filter history items based on search query
    const filteredHistoryItems = useMemo(() => {
        if (!searchQuery.trim()) {
            return HISTORY_ITEMS;
        }
        const query = searchQuery.toLowerCase();
        return HISTORY_ITEMS.filter(item =>
            item.title.toLowerCase().includes(query)
        );
    }, [searchQuery]);

    return (
        <>
            {/* Dimmed Background */}
            <Animated.View style={[styles.overlay, overlayStyle]}>
                <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={1}
                    onPress={togglePanel} />
            </Animated.View>

            {/* Menu Button */}
            <TouchableOpacity
                style={[styles.menuButton, { top: insets.top + 15 }]}
                onPress={togglePanel}
                activeOpacity={0.8}
            >
                <Hamburger
                    type="cross"
                    active={isOpen}
                    onPress={togglePanel}
                    color={themeColors.textPrimary}
                    underlayColor="transparent"
                />
            </TouchableOpacity>



            {/* Sliding Panel */}
            <Animated.View style={[styles.panel, panelStyle, { backgroundColor: themeColors.panel }]}>
                <View style={styles.panelContent}>
                    <SafeAreaView edges={['top']} style={styles.safeArea}>
                        {/*<View style={styles.headerSpacer} />*/}

                        {/* Search Bar - Commented out until history feature is needed */}
                        {/* <View style={styles.searchBarContainer}>
                            <Input
                                placeholder='Search History...'
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                containerStyle={styles.searchInputContainer}
                                inputStyle={styles.searchInput}
                                icon={
                                    <Icons.MagnifyingGlassIcon
                                        size={verticalScale(20)}
                                        color={colors.neutral400}
                                        weight='regular'
                                    />
                                }
                            />
                        </View> */}

                        {/* Main Menu Items */}
                        <View style={styles.contentContainer}>
                            <View style={styles.mainMenuSection}>
                                {isOpen && MAIN_MENU_ITEMS.map((item, index) => {
                                    const IconComponent = Icons[item.icon] as React.ComponentType<any>;
                                    const isActive = (item.id === 'home' && (pathname === '/chatscreen' || pathname === '/')) ||
                                        (item.id !== 'home' && pathname.includes(item.id));

                                    return (
                                        <Animated.View
                                            key={item.id}
                                            entering={FadeInLeft.delay(index * 100).springify().damping(12)}
                                        >
                                            <TouchableOpacity
                                                style={[
                                                    styles.menuItem,
                                                    isActive && {
                                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                                        borderLeftColor: themeColors.accentPrimary
                                                    }
                                                ]}
                                                onPress={() => handleMenuPress(item.id)}
                                                activeOpacity={0.7}
                                            >
                                                <View style={[
                                                    styles.menuIconContainer,
                                                    isActive && { backgroundColor: themeColors.accentPrimary, borderRadius: radius._10 }
                                                ]}>
                                                    <IconComponent
                                                        size={22}
                                                        color={isActive ? colors.white : colors.neutral400}
                                                        weight={isActive ? 'fill' : 'regular'}
                                                    />
                                                </View>
                                                <Typo
                                                    size={16}
                                                    color={isActive ? themeColors.textPrimary : colors.neutral400}
                                                    fontWeight={isActive ? '600' : '500'}
                                                >
                                                    {item.label}
                                                </Typo>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    );
                                })}
                            </View>


                            {/* Divider - Commented out since history section is hidden */}
                            {/* <View style={styles.divider} /> */}

                            {/* History Header - Commented out until history feature is needed */}
                            {/* <View style={styles.historyHeader}>
                                <Typo
                                    size={13}
                                    color={colors.neutral400}
                                    fontWeight="600"
                                    style={styles.historyHeaderText}
                                >
                                    History {searchQuery.trim() ? `(${filteredHistoryItems.length})` : ''}
                                </Typo>
                            </View> */}

                            {/* Scrollable History Section - Commented out until history feature is needed */}
                            {/* <ScrollView
                                style={styles.historyScrollView}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={styles.historyContent}
                                keyboardShouldPersistTaps='handled'
                                keyboardDismissMode='on-drag'
                                nestedScrollEnabled={true}
                            >
                                {filteredHistoryItems.length > 0 ? (
                                    filteredHistoryItems.map((item) => (
                                        <TouchableOpacity
                                            key={item.id}
                                            style={styles.historyItem}
                                            onPress={() => handleHistoryPress(item.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.historyIcon}>
                                                <Icons.ChatCircle size={18} color={colors.neutral400} weight="regular" />
                                            </View>

                                            <View style={styles.historyTextContainer}>
                                                <Typo
                                                    size={15}
                                                    color={colors.white}
                                                    fontWeight='400'
                                                    textProps={{
                                                        numberOfLines: 1,
                                                        ellipsizeMode: 'tail'
                                                    }}
                                                >
                                                    {item.title}
                                                </Typo>

                                                <Typo
                                                    size={12}
                                                    color={colors.neutral400}
                                                    fontWeight="400"
                                                >
                                                    {item.date}
                                                </Typo>
                                            </View>
                                        </TouchableOpacity>
                                    ))
                                ) : (
                                    <View style={styles.noResultsContainer}>
                                        <Typo
                                            size={14}
                                            color={colors.neutral400}
                                            fontWeight="400"
                                            style={styles.noResultsText}
                                        >
                                            {searchQuery.trim() ? 'No history found' : 'No history items'}
                                        </Typo>
                                    </View>
                                )}
                            </ScrollView> */}
                        </View>


                    </SafeAreaView>

                    {/* Bottom Section - User Info */}
                    <View style={[
                        styles.bottomSection,
                        {
                            paddingBottom: Math.max(insets.bottom, spacingY._25) + verticalScale(45),
                            backgroundColor: themeColors.panel || brandPalette.dark.panel,
                        }
                    ]}>
                        <View style={[styles.divider, { marginBottom: spacingY._10 }]} />
                        {/*Bug Report*/}
                        <TouchableOpacity
                            style={styles.bugReportButton}
                            activeOpacity={0.7}
                            onPress={() => {
                                setShowBugReport(true);
                            }}
                        >
                            <View style={styles.bugReportIconContainer}>
                                <Icons.BugBeetle size={20} color={colors.neutral400} weight="regular" />
                            </View>
                            <Typo
                                size={14}
                                color={colors.neutral400}
                                fontWeight="500"
                            >
                                Report a Bug
                            </Typo>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.userButton}
                            activeOpacity={0.7}
                            onPress={() => {
                                closePanel();
                                router.push('/settings' as any);
                            }}
                        >
                            <View style={styles.userIconContainer}>
                                <Icons.UserCircle size={32} color={colors.white} weight="fill" />
                            </View>

                            <View style={styles.userInfo}>
                                <Typo
                                    size={15}
                                    color={colors.white}
                                    fontWeight="600"
                                    textProps={{ numberOfLines: 1 }}
                                >
                                    {userName}
                                </Typo>
                                <Typo
                                    size={13}
                                    color={colors.neutral400}
                                    fontWeight="400"
                                    textProps={{ numberOfLines: 1 }}
                                >
                                    {userEmail}
                                </Typo>
                            </View>
                        </TouchableOpacity>
                    </View>


                </View>

            </Animated.View>

            {showBugReport && (
                <BugReportModal
                    visible={showBugReport}
                    onClose={() => setShowBugReport(false)}
                />
            )}
        </>
    )
}

export default SlidingPanel

const styles = StyleSheet.create({
    topBarContainer: {
        position: 'absolute',
        left: 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10,
        zIndex: 901,
    },
    searchBarContainer: {
        paddingLeft: 80, // Extra padding to clear menu button (20px position + ~50px button width)
        paddingRight: spacingX._20,
        paddingBottom: spacingY._10,
        paddingTop: spacingY._20,
        //alignItems: 'center', // Center the search input horizontally
    },
    searchInputContainer: {
        height: verticalScale(45),
        backgroundColor: colors.neutral100,
        borderColor: colors.neutral200,
        paddingHorizontal: spacingX._12,
        //flex: 1, // Take available space and center with alignItems
        //maxWidth: '100%',
        width: '100%',
    },
    searchInput: {
        fontSize: verticalScale(14),
        color: colors.text,
    },
    menuButton: {
        position: "absolute",
        //top: 20, 
        left: 20,
        zIndex: 901,
        borderRadius: 25,

        overflow: 'hidden',

        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gradientButton: {
        padding: 8,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 899,
    },
    panel: {
        position: "absolute",
        top: 0,
        left: 0,
        width: width * 0.8,
        height: screenHeight, // Use screen height to stay fixed regardless of keyboard
        zIndex: 900,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        overflow: 'hidden',
        backgroundColor: 'rgba(18, 18, 18, 0.95)', // Semi-transparent
        borderRightWidth: 1,
        borderRightColor: 'rgba(255, 255, 255, 0.05)',
    },
    panelContent: {
        flex: 1,
        position: 'relative', // Important for absolute positioning of children
    },
    safeArea: {
        flex: 1,
        flexDirection: 'column',
    },
    headerSpacer: {
        height: 50, // Reduced from 60 to make room
        paddingTop: spacingY._5, // Reduced padding
    },
    contentContainer: {
        flex: 1,
        minHeight: 0,
        paddingBottom: 0, // Removed padding since history section is gone
    },
    mainMenuSection: {
        paddingHorizontal: spacingX._20,
        paddingTop: verticalScale(85), // Increased to account for hamburger button and safe area
        gap: spacingY._10, // Increased gap for better spacing between items
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._12,
        paddingHorizontal: spacingX._15,
        borderRadius: radius._10,
        gap: spacingX._15,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    menuIconContainer: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginVertical: spacingY._15,
        marginHorizontal: spacingX._20,
    },
    historyHeader: {
        paddingHorizontal: spacingX._20,
        paddingBottom: spacingY._10,
    },
    historyHeaderText: {
        letterSpacing: 0.5,
    },
    historyScrollView: {
        flex: 1,
    },
    historyContent: {
        paddingHorizontal: spacingX._20,
        gap: spacingY._5,
        paddingBottom: spacingY._10,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._10,
        paddingHorizontal: spacingX._15,
        borderRadius: radius._10,
        gap: spacingX._12,
    },
    historyIcon: {
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    historyTextContainer: {
        flex: 1,
        gap: 2,
        minWidth: 0,
    },
    bottomSection: {
        position: 'absolute', // Fixed at bottom of screen
        bottom: 0, // Stay at bottom, will be behind keyboard (like ChatGPT mobile)
        left: 0,
        right: 0,
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._10,
        zIndex: 10,
    },

    userButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._12,
        paddingHorizontal: spacingX._15,
        borderRadius: radius._10,
        gap: spacingX._15,
    },

    bugReportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._12,
        paddingHorizontal: spacingX._15,
        borderRadius: radius._10,
        gap: spacingX._12,
    },

    bugReportIconContainer: {
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },

    userIconContainer: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
        gap: 2,
        minWidth: 0,
    },
    noResultsContainer: {
        paddingVertical: spacingY._20,
        alignItems: 'center',
    },
    noResultsText: {
        textAlign: 'center',
    },

});
