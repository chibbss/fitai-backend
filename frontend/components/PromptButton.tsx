import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { ButtonProps } from '@/types'
import { colors, radius } from '@/constants/theme'
import { verticalScale } from '@/utils/styling'
import Loading from './Loading'

const PromptButton = ({
  style,
  onPress,
  children,
  loading = false,
}: ButtonProps) => {

  if (loading) {
    return (
      <View style={[styles.button, style, { backgroundColor: 'transparent' }]}>
        <Loading />
      </View>
    )

  }

  return (
    <TouchableOpacity onPress={onPress} style={[styles.button, style]}>
      {children}
    </TouchableOpacity>
  )
}

export default PromptButton

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius._15,
    borderCurve: 'continuous',
    paddingVertical: verticalScale(20),
    paddingHorizontal: verticalScale(10),
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1, 
  },
});

