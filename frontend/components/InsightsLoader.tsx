import React from 'react';
import { View, StyleSheet, Text, Animated } from 'react-native';

const LoadingRing = () => {
    const spin1 = React.useRef(new Animated.Value(0)).current;
    const spin2 = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        // First ring - 2s forward
        Animated.loop(
            Animated.timing(spin1, {
                toValue: 1,
                duration: 2000,
                useNativeDriver: true,
            })
        ).start();

        // Second ring - 2.4s reverse
        Animated.loop(
            Animated.timing(spin2, {
                toValue: 1,
                duration: 2400,
                useNativeDriver: true,
            })
        ).start();
    }, []);

    const rotate1 = spin1.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const rotate2 = spin2.interpolate({
        inputRange: [0, 1],
        outputRange: ['360deg', '0deg'],
    });

    return (
        <View style={styles.container}>
            {/* Outer ring - teal */}
            <Animated.View
                style={[
                    styles.ring,
                    styles.ring1,
                    { transform: [{ rotate: rotate1 }] },
                ]}
            />
            {/* Inner ring - aqua (reverse) */}
            <Animated.View
                style={[
                    styles.ring,
                    styles.ring2,
                    { transform: [{ rotate: rotate2 }] },
                ]}
            />
        </View>
    );
};

const InsightsReveal = ({ message = "Analyzing your training load..." }) => {
    return (
        <View style={styles.insightsContainer}>
            <View style={styles.insightsRow}>
                <LoadingRing />
                <View style={styles.loadingCopy}>
                    <Text style={styles.loadingTitle}>{message}</Text>
                    <Text style={styles.loadingDescription}>
                        Tap into this loop when fetching insights or regenerating plans.
                    </Text>
                </View>
            </View>
            <View style={styles.microMoments}>
                <View style={styles.microTag}>
                    <Text style={styles.microTagText}>Rep Breakdown</Text>
                </View>
                <View style={styles.microTag}>
                    <Text style={styles.microTagText}>Insight Refresh</Text>
                </View>
                <View style={styles.microTag}>
                    <Text style={styles.microTagText}>Memory Sync</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(255, 51, 102, 0.65)',
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    ring: {
        position: 'absolute',
        width: 58,
        height: 58,
        borderRadius: 29,
        borderWidth: 3,
        borderColor: 'transparent',
    },
    ring1: {
        borderTopColor: '#00ffc8',
        borderLeftColor: '#00ffc8',
    },
    ring2: {
        borderBottomColor: '#00e4ff',
        borderRightColor: '#00e4ff',
    },
    insightsContainer: {
        padding: 20,
    },
    insightsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
        marginBottom: 16,
    },
    loadingCopy: {
        flex: 1,
    },
    loadingTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#f871a0',
        marginBottom: 4,
    },
    loadingDescription: {
        fontSize: 13,
        color: '#d1d5db',
        lineHeight: 20,
    },
    microMoments: {
        flexDirection: 'row',
        gap: 16,
        flexWrap: 'wrap',
    },
    microTag: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(255, 51, 102, 0.16)',
    },
    microTagText: {
        color: '#ff6b88',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});

export { LoadingRing, InsightsReveal };