import { Dimensions, StyleSheet, Text, TouchableOpacity, View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import React, { useMemo, useState } from 'react'
// @ts-ignore
import Hamburger from 'react-native-animated-hamburger';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import * as Icons from 'phosphor-react-native';
import Typo from './Typo';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Input from './Input';
import { verticalScale } from '@/utils/styling';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get("window");
const screenHeight = Dimensions.get('screen').height;


interface MenuItem {
    id: string;
    label: string;
    icon: keyof typeof Icons;
}

const MAIN_MENU_ITEMS: MenuItem[] = [
    { id: 'home', label: 'Home', icon: 'House' },
    { id: 'calendar', label: 'Calendar', icon: 'Calendar' },
    { id: 'workout-log', label: 'Workout Log', icon: 'Barbell' },
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
    const [isOpen, setIsOpen] = useState(false);
    const translateX = useSharedValue(-width * 0.8);
    const overlayOpacity = useSharedValue(0);
    const insets = useSafeAreaInsets();
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();

    const togglePanel = () => {
        const newState = !isOpen;
        setIsOpen(newState);

        translateX.value = withTiming(newState ? 0 : -width * 0.8, { duration: 300 });
        overlayOpacity.value = withTiming(newState ? 0.5 : 0, { duration: 300 });
    };

    const closePanel = () => {
        setIsOpen(false);
        translateX.value = withTiming(-width * 0.8, { duration: 300 }); // Fix: Match panel width
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
                router.push('/chatscreen' as any); // Use '/chatscreen' or cast to any
                break;
            case 'calendar':
                router.push('/calendar' as any); // Use '/calendar' or cast to any
                break;
            case 'workout-log':
                router.push('/workout-log' as any); // Use '/workout-log' or cast to any
                break;
            default:
                console.log('Menu item pressed:', itemId);
        }
    };

    const handleHistoryPress = (itemId: string) => {
        console.log('History item pressed:', itemId);
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
                <LinearGradient
                    colors={['#ffb347', '#ffcc33']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradientButton}
                >
                    <Hamburger
                        type="cross"
                        active={isOpen}
                        onPress={togglePanel}
                        color={colors.white}
                        underlayColor="transparent"
                    />
                </LinearGradient>
            </TouchableOpacity>



            {/* Sliding Panel */}
            <Animated.View style={[styles.panel, panelStyle]}>
                <View style={styles.panelContent}>
                    <SafeAreaView edges={['top']} style={styles.safeArea}>
                        {/*<View style={styles.headerSpacer} />*/}

                        {/* Search Bar */}
                        <View style={styles.searchBarContainer}>
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
                        </View>

                        {/* Main Menu Items */}
                        <View style={styles.contentContainer}>
                            <View style={styles.mainMenuSection}>
                                {MAIN_MENU_ITEMS.map((item) => {
                                    const IconComponent = Icons[item.icon] as React.ComponentType<any>;
                                    return (
                                        <TouchableOpacity
                                            key={item.id}
                                            style={styles.menuItem}
                                            onPress={() => handleMenuPress(item.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.menuIconContainer}>
                                                <IconComponent
                                                    size={22}
                                                    color={colors.white}
                                                    weight='regular'
                                                />
                                            </View>
                                            <Typo
                                                size={16}
                                                color={colors.white}
                                                fontWeight='500'
                                            >
                                                {item.label}
                                            </Typo>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>


                            {/* Divider */}
                            <View style={styles.divider} />

                            {/* History Header */}
                            <View style={styles.historyHeader}>
                                <Typo
                                    size={13}
                                    color={colors.neutral400}
                                    fontWeight="600"
                                    style={styles.historyHeaderText}
                                >
                                    History {searchQuery.trim() && `(${filteredHistoryItems.length})`}
                                </Typo>
                            </View>

                            {/* Scrollable History Section */}
                            <ScrollView
                                style={styles.historyScrollView}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={styles.historyContent}
                                keyboardShouldPersistTaps='handled'
                                keyboardDismissMode='on-drag'
                                nestedScrollEnabled={true}
                            >
                                {/*{HISTORY_ITEMS.map((item) => (
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
                            ))}*/}
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

                            </ScrollView>
                        </View>


                    </SafeAreaView>

                    {/* Bottom Section - User Info */}
                    <View style={[
                        styles.bottomSection,
                        {
                            paddingBottom: insets.bottom + spacingY._15
                        }
                    ]}>
                        <View style={styles.divider} />
                        <TouchableOpacity
                            style={styles.userButton}
                            activeOpacity={0.7}
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
                                    User Name
                                </Typo>
                                <Typo
                                    size={13}
                                    color={colors.neutral400}
                                    fontWeight="400"
                                    textProps={{ numberOfLines: 1 }}
                                >
                                    user@example.com
                                </Typo>
                            </View>
                        </TouchableOpacity>
                    </View>


                </View>
            </Animated.View>

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
        elevation: 4,
        overflow: 'hidden',
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
        backgroundColor: colors.neutral900,
        zIndex: 900,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        overflow: 'hidden',
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
        paddingBottom: 100,
    },
    mainMenuSection: {
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._5, // Reduced from spacingY._10
        gap: spacingY._5,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._12,
        paddingHorizontal: spacingX._15,
        borderRadius: radius._10,
        gap: spacingX._15,
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
        backgroundColor: colors.neutral900,
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
