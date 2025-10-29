import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React, { useState } from 'react'
// @ts-ignore
import Hamburger from 'react-native-animated-hamburger';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';
import * as Icons from 'phosphor-react-native';
import Typo from './Typo';

const { width } = Dimensions.get("window");

const SlidingPanel = () => {
    const [isOpen, setIsOpen] = useState(false);
    const translateX = useSharedValue(-width * 0.7);
    const overlayOpacity = useSharedValue(0);

    const togglePanel = () => {
        const newState = !isOpen;
        setIsOpen(newState);

        translateX.value = withTiming(newState ? 0 : -width * 0.7, { duration: 300 });
        overlayOpacity.value = withTiming(newState ? 0.5 : 0, { duration: 300 });
    };

    const panelStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const overlayStyle = useAnimatedStyle(() => ({
        opacity: overlayOpacity.value,
        pointerEvents: isOpen ? "auto" : "none",
    }));

    return (
        <>
            {/* Dimmed Background */}
            <Animated.View style={[styles.overlay, overlayStyle]}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={togglePanel} />
            </Animated.View>

            {/* Menu Button */}
            <TouchableOpacity style={styles.menuButton} onPress={togglePanel} activeOpacity={1}>
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
            <Animated.View style={[styles.panel, panelStyle, { backgroundColor: colors.neutral800 }]}>

                {/* Top Section */}
                <View style={styles.panelContent}>
                    {/* Example  */}
                    <Typo size={20} color={colors.white} fontWeight="600">Home</Typo>
                    <Typo size={20} color={colors.white} fontWeight="600">Settings</Typo>
                </View>

                {/* Bottom Section */}
                <View>
                    <View style={styles.divider} />


                    <TouchableOpacity style={styles.userButton}>
                        <View style={styles.userIcon}>
                            <Icons.UserCircle size={28} color={colors.white} />
                        </View>
                        <Typo size={18} color={colors.white} fontWeight="600">UserName</Typo>
                    </TouchableOpacity>
                </View>

            </Animated.View>
        </>
    )
}

export default SlidingPanel

const styles = StyleSheet.create({
    menuButton: {
        position: "absolute",
        top: 50,
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
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 10,
    },
    panel: {
        position: "absolute",
        top: 0,
        left: 0,
        width: width * 0.7,
        height: "100%",
        paddingHorizontal: 20,
        paddingTop: 100,
        zIndex: 900,
        elevation: 6,
        flexDirection: 'column',
        justifyContent: 'space-between', // ensures bottom section stays at the bottom
    },
    panelContent: {
        gap: 20,
    },
    userButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12, 
        marginBottom: 10,    
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.2)', // lighter and more subtle
        marginTop: 8,
        marginBottom: 6, // pulls the userButton closer
    },

    userIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.neutral700,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },

});
