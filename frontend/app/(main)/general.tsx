import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackButton from '@/components/BackButton';
import Typo from '@/components/Typo';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import * as Icons from 'phosphor-react-native';
import { getAccentColor, setAccentColor, ACCENT_COLORS, AccentColor, getAccentColorName } from '@/utils/settings';

const GeneralSettings = () => {
    const router = useRouter();
    const [accentColor, setAccentColorValue] = useState<string>('#16a34a');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [colorScheme] = useState<string>('Dark');

    useEffect(() => {
        loadAccentColor();
    }, []);

    const loadAccentColor = async () => {
        const color = await getAccentColor();
        setAccentColorValue(color);
    };

    const handleAccentColorSelect = async (color: AccentColor) => {
        setAccentColorValue(color.value);
        await setAccentColor(color.value);
        setShowColorPicker(false);
    };

    const renderSettingCard = (
        icon: keyof typeof Icons,
        label: string,
        value: string,
        onPress?: () => void,
        showChevron: boolean = false,
        colorDot?: string
    ) => {
        const IconComponent = Icons[icon] as React.ComponentType<any>;
        return (
            <TouchableOpacity
                style={styles.settingCard}
                onPress={onPress}
                activeOpacity={onPress ? 0.7 : 1}
                disabled={!onPress}
            >
                <View style={styles.settingIcon}>
                    <IconComponent size={22} color={colors.white} weight="regular" />
                </View>
                <View style={styles.settingContent}>
                    <Typo
                        size={16}
                        color={colors.white}
                        fontWeight="500"
                    >
                        {label}
                    </Typo>
                    <View style={styles.settingValueContainer}>
                        {colorDot && (
                            <View style={[styles.colorDot, { backgroundColor: colorDot }]} />
                        )}
                        <Typo
                            size={14}
                            color={colors.neutral400}
                            fontWeight="400"
                        >
                            {value}
                        </Typo>
                    </View>
                </View>
                {showChevron && (
                    <Icons.CaretDown size={20} color={colors.neutral400} weight="bold" style={styles.chevron} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <BackButton iconSize={24} color={colors.white} />
                <Typo size={28} color={colors.white} fontWeight="700" style={styles.headerTitle}>
                    General
                </Typo>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Color Scheme */}
                {renderSettingCard('Sun', 'Color scheme', colorScheme)}

                {/* Accent Color */}
                {renderSettingCard(
                    'PaintBrush',
                    'Accent color',
                    getAccentColorName(accentColor),
                    () => setShowColorPicker(true),
                    true,
                    accentColor
                )}

                {/* Language */}
                {renderSettingCard('Globe', 'Language', 'English')}
            </ScrollView>

            {/* Color Picker Modal */}
            <Modal
                visible={showColorPicker}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowColorPicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Typo size={20} color={colors.white} fontWeight="600">
                                Select Accent Color
                            </Typo>
                            <TouchableOpacity
                                onPress={() => setShowColorPicker(false)}
                                style={styles.closeButton}
                            >
                                <Icons.X size={24} color={colors.white} weight="bold" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.colorList} showsVerticalScrollIndicator={false}>
                            {ACCENT_COLORS.map((color) => (
                                <TouchableOpacity
                                    key={color.value}
                                    style={[
                                        styles.colorOption,
                                        accentColor === color.value && styles.colorOptionSelected,
                                    ]}
                                    onPress={() => handleAccentColorSelect(color)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.colorOptionDot, { backgroundColor: color.value }]} />
                                    <Typo
                                        size={16}
                                        color={colors.white}
                                        fontWeight={accentColor === color.value ? '600' : '400'}
                                    >
                                        {color.name}
                                    </Typo>
                                    {accentColor === color.value && (
                                        <Icons.Check size={20} color={colors.white} weight="bold" style={styles.checkIcon} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default GeneralSettings;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.neutral900,
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
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._20,
        paddingBottom: spacingY._30,
    },
    settingCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.neutral800,
        borderRadius: radius._12,
        paddingVertical: spacingY._15,
        paddingHorizontal: spacingX._15,
        marginBottom: spacingY._10,
    },
    settingIcon: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacingX._15,
    },
    settingContent: {
        flex: 1,
        gap: 4,
    },
    settingValueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10,
    },
    colorDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    chevron: {
        marginLeft: spacingX._10,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: colors.neutral800,
        borderTopLeftRadius: radius._20,
        borderTopRightRadius: radius._20,
        paddingTop: spacingY._20,
        paddingBottom: spacingY._30,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacingX._20,
        paddingBottom: spacingY._20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    closeButton: {
        padding: spacingX._5,
    },
    colorList: {
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._15,
    },
    colorOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._15,
        paddingHorizontal: spacingX._15,
        borderRadius: radius._10,
        marginBottom: spacingY._5,
    },
    colorOptionSelected: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    colorOptionDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: spacingX._15,
        borderWidth: 2,
        borderColor: colors.white,
    },
    checkIcon: {
        marginLeft: 'auto',
    },
});