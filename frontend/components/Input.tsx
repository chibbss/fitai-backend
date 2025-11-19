import { StyleSheet, Text, TextInput, View } from 'react-native'
import React, { useState } from 'react'
import { InputProps } from '@/types'
import { colors, radius, spacingX } from '@/constants/theme'
import { verticalScale } from '@/utils/styling'
import { useTheme } from '@/context/ThemeContext'
import { LinearGradient } from 'expo-linear-gradient'

const Input = (props: InputProps) => {
    const { mode, colors: themeColors, setPreference } = useTheme();
    const [isFocused, setIsFocused] = useState(false)
    
    return (
        <View style={styles.wrapper}>
            {isFocused && (
                <LinearGradient
                    colors={themeColors.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFill, styles.gradientBorder]}
                    pointerEvents="none"
                />
            )}
            <View style={[styles.container, isFocused && styles.containerInner]}>
                {props.icon && props.icon}
                <TextInput
                    style={[styles.input, props.inputStyle]}
                    placeholderTextColor={colors.neutral400}
                    ref={props.inputRef && props.inputRef}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    {...props}
                />
            </View>
        </View>
    )
}

export default Input

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
        position: 'relative',
    },
    container: {
        flexDirection: 'row',
        height: verticalScale(56),
        alignItems:'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.neutral200,
        borderRadius: radius.full,
        borderCurve: 'continuous',
        paddingHorizontal: spacingX._15,
        backgroundColor: colors.neutral100,
        gap: spacingX._10,
        zIndex: 1,
    },
    gradientBorder: {
        borderRadius: radius.full,
        padding: 1.5,
        zIndex: 0,
    },
    containerInner: {
        borderWidth: 0,
        backgroundColor: colors.neutral100,
        margin: 1.5,
    },
    input: {
        flex: 1,
        color: colors.text,
        fontSize: verticalScale(14),
    },
})