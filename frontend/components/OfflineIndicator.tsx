import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import Typo from './Typo';
import { colors, spacingX, spacingY } from '@/constants/theme';

export default function OfflineIndicator() {
    const [isConnected, setIsConnected] = useState(true);
    const [slideAnim] = useState(new Animated.Value(-100));

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            const connected = state.isConnected ?? false;
            setIsConnected(connected);

            if (!connected) {
                // Slide down
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                }).start();
            } else {
                // Slide up
                Animated.spring(slideAnim, {
                    toValue: -100,
                    useNativeDriver: true,
                }).start();
            }
        });

        return () => unsubscribe();
    }, [slideAnim]);

    if (isConnected) {
        return null;
    }

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    transform: [{ translateY: slideAnim }],
                },
            ]}
        >
            <View style={styles.content}>
                <Typo size={14} fontWeight="600" color={colors.white}>
                    No Internet Connection
                </Typo>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: colors.error,
        paddingVertical: spacingY._10,
        paddingHorizontal: spacingX._20,
    },
    content: {
        alignItems: 'center',
    },
});
