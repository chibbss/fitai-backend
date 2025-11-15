import React, { useEffect } from 'react';
import {
    View,
    Modal,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Dimensions,
} from 'react-native';
import { radius, spacingX, spacingY, colors } from '@/constants/theme';
import Typo from '@/components/Typo';
import Button from '@/components/Button';
import * as Icons from 'phosphor-react-native';
import { verticalScale } from '@/utils/styling';

const { width } = Dimensions.get('window');

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
            scaleAnim.setValue(0);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    const getTypeConfig = () => {
        switch (type) {
            case 'success':
                return {
                    icon: 'CheckCircle' as keyof typeof Icons,
                    iconColor: colors.accentPrimary,
                    backgroundColor: colors.accentPrimary + '15',
                };
            case 'error':
                return {
                    icon: 'XCircle' as keyof typeof Icons,
                    iconColor: colors.accentWarm,
                    backgroundColor: colors.accentWarm + '15',
                };
            case 'warning':
                return {
                    icon: 'Warning' as keyof typeof Icons,
                    iconColor: colors.accentSecondary,
                    backgroundColor: colors.accentSecondary + '40',
                };
            default:
                return {
                    icon: 'Info' as keyof typeof Icons,
                    iconColor: colors.accentPrimary,
                    backgroundColor: colors.accentPrimary + '30',
                };
        }
    };

    const typeConfig = getTypeConfig();
    const IconComponent = Icons[typeConfig.icon] as React.ComponentType<any>;

    const handleButtonPress = (button: AlertButton) => {
        if (button.onPress) {
            button.onPress();
        }
        if (onDismiss) {
            onDismiss();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onDismiss}
        >
            <TouchableWithoutFeedback onPress={onDismiss}>
                <Animated.View
                    style={[
                        styles.overlay,
                        {
                            opacity: opacityAnim,
                        },
                    ]}
                >
                    <TouchableWithoutFeedback>
                        <Animated.View
                            style={[
                                styles.alertContainer,
                                {
                                    transform: [{ scale: scaleAnim }],
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
                                    size={48}
                                    color={typeConfig.iconColor}
                                    weight="fill"
                                />
                            </View>

                            {/* Title */}
                            {title && (
                                <Typo
                                    size={20}
                                    fontWeight="600"
                                    color={colors.black}
                                    color={colors.textPrimary}
                                    style={styles.title}
                                >
                                    {title}
                                </Typo>
                            )}

                            {/* Message */}
                            <Typo
                                size={16}
                                color={colors.neutral600}
                                color={colors.textSecondary}
                                style={styles.message}
                            >
                                {message}
                            </Typo>

                            {/* Buttons */}
                            <View style={styles.buttonContainer}>
                                {buttons.length === 1 ? (
                                    <Button
                                        style={[
                                            styles.button,
                                            buttons[0].style === 'destructive' &&
                                                styles.destructiveButton,
                                        ]}
                                        onPress={() => handleButtonPress(buttons[0])}
                                    >
                                        <Typo
                                            fontWeight="600"
                                            color={
                                                buttons[0].style === 'destructive'
                                                    ? colors.surface
                                                    : colors.textPrimary
                                            }
                                            size={16}
                                        >
                                            {buttons[0].text}
                                        </Typo>
                                    </Button>
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
                                            >
                                                <Typo
                                                    fontWeight="600"
                                                    color={
                                                        button.style === 'destructive'
                                                    ? colors.accentWarm
                                                    : button.style === 'cancel'
                                                    ? colors.textSecondary
                                                    : colors.accentPrimary
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
                    </TouchableWithoutFeedback>
                </Animated.View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacingX._20,
    },
    alertContainer: {
        backgroundColor: colors.white,
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
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacingY._15,
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
        backgroundColor: colors.rose,
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