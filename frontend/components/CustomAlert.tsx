import React, { useEffect } from 'react';
import {
    View,
    Modal,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Dimensions,
    Pressable,
} from 'react-native';
import { radius, spacingX, spacingY, colors as rawColors } from '@/constants/theme';
import Typo from '@/components/Typo';
import Button from '@/components/Button';
import * as Icons from 'phosphor-react-native';
import { useTheme } from '@/context/ThemeContext';

const { width, height } = Dimensions.get('window');

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
    visible: boolean;
    title?: string;
    message: string;
    type?: AlertType;
    buttons?: AlertButton[];
    onDismiss?: () => void;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
    visible,
    title,
    message,
    type = 'info',
    buttons = [{ text: 'OK' }],
    onDismiss,
}) => {
    const { colors: themeColors } = useTheme();
    const scaleAnim = React.useRef(new Animated.Value(0)).current;
    const opacityAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 50,
                    friction: 7,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(scaleAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible, scaleAnim, opacityAnim]);

    useEffect(() => {
        console.log('[CustomAlert] Mounted');
        return () => console.log('[CustomAlert] Unmounted');
    }, []);

    const getThemeColors = () => {
        // Force specific colors as requested
        return {
            bg: themeColors.background,
            text: themeColors.textPrimary,
            // Construct button colors based on type
        };
    };

    const getTypeConfig = () => {
        // User requested accentPrimary for icon and button regardless of type,
        // but we can still keep some variety if needed. 
        // For now, let's stick to the requested accentPrimary for the main colored elements.

        switch (type) {
            case 'success':
                return {
                    icon: 'CheckCircle' as keyof typeof Icons,
                    color: themeColors.accentPrimary,
                    backgroundColor: 'transparent',
                };
            case 'error':
                return {
                    icon: 'XCircle' as keyof typeof Icons,
                    color: themeColors.accentPrimary, // Requested to use accentPrimary
                    backgroundColor: 'transparent',
                };
            case 'warning':
                return {
                    icon: 'Warning' as keyof typeof Icons,
                    color: themeColors.accentPrimary, // Requested to use accentPrimary
                    backgroundColor: 'transparent',
                };
            default:
                return {
                    icon: 'Info' as keyof typeof Icons,
                    color: themeColors.accentPrimary,
                    backgroundColor: 'transparent',
                };
        }
    };

    const typeConfig = getTypeConfig();
    const IconComponent = Icons[typeConfig.icon] as React.ComponentType<any>;

    const handleButtonPress = (button: AlertButton) => {
        console.log('[CustomAlert] Button pressed:', button.text);

        // Execute button action first
        if (button.onPress) {
            console.log('[CustomAlert] Executing button onPress');
            try {
                button.onPress();
            } catch (e) {
                console.error('[CustomAlert] Error in button onPress:', e);
            }
        }

        // Then dismiss
        console.log('[CustomAlert] Calling onDismiss');
        if (onDismiss) {
            onDismiss();
        } else {
            console.warn('[CustomAlert] onDismiss is undefined');
        }
    };

    return (
        <View
            style={[styles.container, StyleSheet.absoluteFill, { zIndex: 9999 }]}
            pointerEvents={visible ? 'auto' : 'none'}
        >
            {/* Backdrop - Click to dismiss */}
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        opacity: opacityAnim,
                    },
                ]}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
            </Animated.View>

            {/* Alert Box */}
            <Animated.View
                style={[
                    styles.alertContainer,
                    {
                        backgroundColor: rawColors.white, // Use raw white color
                        transform: [{ scale: scaleAnim }],
                        opacity: opacityAnim, // Restore opacity animation
                    },
                ]}
            >
                {/* Icon */}
                <View
                    style={[
                        styles.iconContainer,
                        { backgroundColor: typeConfig.backgroundColor },
                    ]}
                >
                    <IconComponent
                        size={68}
                        color={themeColors.background} // Force accentPrimary as requested
                        weight="fill"
                    />
                </View>

                {/* Title */}
                {title && (
                    <Typo
                        size={22}
                        fontWeight="800" // Bolder
                        color={rawColors.black} // Force black
                        style={styles.title}
                    >
                        {title}
                    </Typo>
                )}

                {/* Message */}
                <Typo
                    size={16}
                    color={rawColors.black} // Force black
                    fontWeight="600" // Semi-bold for message
                    style={styles.message}
                >
                    {message}
                </Typo>

                <View style={styles.buttonContainer}>
                    {buttons.length === 1 ? (
                        <TouchableOpacity
                            style={[
                                styles.button,
                                buttons[0].style === 'destructive' &&
                                styles.destructiveButton,
                                {
                                    backgroundColor: buttons[0].style === 'destructive' ? themeColors.accentWarm : themeColors.accentPrimary, // Use accentPrimary
                                    borderRadius: radius.full,
                                    paddingVertical: spacingY._15,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                }
                            ]}
                            onPress={() => handleButtonPress(buttons[0])}
                            activeOpacity={0.7}
                        >
                            <Typo
                                fontWeight="800" // Bolder
                                color={rawColors.black}
                                size={16}
                            >
                                {buttons[0].text}
                            </Typo>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.multipleButtons}>
                            {buttons.map((button, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.textButton,
                                        button.style === 'cancel' &&
                                        styles.cancelButton,
                                        button.style === 'destructive' &&
                                        styles.destructiveTextButton,
                                    ]}
                                    onPress={() => handleButtonPress(button)}
                                    activeOpacity={0.7}
                                >
                                    <Typo
                                        fontWeight="800" // Bolder
                                        color={
                                            button.style === 'destructive'
                                                ? themeColors.accentWarm
                                                : button.style === 'cancel'
                                                    ? rawColors.neutral600
                                                    : themeColors.accentPrimary
                                        }
                                        size={16}
                                    >
                                        {button.text}
                                    </Typo>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: width,
        height: height,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        zIndex: 1,
    },
    alertContainer: {
        borderRadius: radius._20,
        padding: spacingX._25,
        width: width * 0.85,
        maxWidth: 400,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        zIndex: 10,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacingY._5,
    },
    title: {
        marginBottom: spacingY._10,
        textAlign: 'center',
    },
    message: {
        textAlign: 'center',
        marginBottom: spacingY._20,
        lineHeight: 22,
    },
    buttonContainer: {
        width: '100%',
        marginTop: spacingY._10,
    },
    button: {
        width: '100%',
    },
    destructiveButton: {
        // backgroundColor handled dynamically
    },
    multipleButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        gap: spacingX._15,
    },
    textButton: {
        flex: 1,
        paddingVertical: spacingY._12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        // Styled via text color
    },
    destructiveTextButton: {
        // Styled via text color
    },
});

export default CustomAlert;