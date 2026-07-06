import Typo from '@/components/Typo';
import { spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import * as Icons from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type Props = {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    right?: React.ReactNode;
};

const ScreenHeader = ({ title, subtitle, onBack, right }: Props) => {
    const { colors } = useTheme();

    return (
        <View style={styles.row}>
            <View style={styles.left}>
                {onBack && (
                    <TouchableOpacity
                        onPress={onBack}
                        style={[styles.backBtn, { backgroundColor: colors.card }]}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <Icons.CaretLeftIcon size={20} color={colors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                )}

                <View style={{ flexShrink: 1 }}>
                    <Typo size={28} fontWeight="800" color={colors.textPrimary}>
                        {title}
                    </Typo>
                    {subtitle ? (
                        <Typo size={14} color={colors.textSecondary} style={{ marginTop: 2 }}>
                            {subtitle}
                        </Typo>
                    ) : null}
                </View>
            </View>
            {right ? <View>{right}</View> : null}
        </View>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._10,
        paddingBottom: spacingY._15,
    },
    left: { flexDirection: 'row', alignItems: 'center', gap: spacingX._12, flexShrink: 1 },
    backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

export default ScreenHeader;