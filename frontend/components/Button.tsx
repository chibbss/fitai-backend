import { StyleSheet, TouchableOpacity, View } from 'react-native'
import React, { useMemo } from 'react'
import { ButtonProps } from '@/types'
import { radius } from '@/constants/theme'
import { verticalScale } from '@/utils/styling'
import Loading from './Loading'
import { useTheme } from '@/context/ThemeContext'

const Button = ({
  style,
  onPress,
  children,
  loading = false,
}: ButtonProps) => {
  const { colors } = useTheme();

  const baseStyle = useMemo(
    () =>
      StyleSheet.create({
        button: {
          backgroundColor: colors.accentPrimary,
          borderRadius: radius.full,
          borderCurve: 'continuous',
          height: verticalScale(56),
          justifyContent: 'center',
          alignItems: 'center',
        },
      }),
    [colors]
  );

  if (loading) {
    return (
      <View style={[baseStyle.button, style, { backgroundColor: 'transparent' }]}>
        <Loading />
      </View>
    )

  }

  return (
    <TouchableOpacity onPress={onPress} style={[baseStyle.button, style]}>
      {children}
    </TouchableOpacity>
  )
}

export default Button