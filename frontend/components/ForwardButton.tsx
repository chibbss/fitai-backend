import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { colors } from '@/constants/theme'
import { BackButtonProps } from '@/types'
import { useRouter } from 'expo-router'
import { CaretRightIcon} from 'phosphor-react-native'
import { verticalScale } from '@/utils/styling'

const ForwardButton = ({
    style,
    iconSize = 26,
    color = colors.white
}: BackButtonProps) => {

    const router = useRouter();

    return (
        <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.button, style]}
        >
            <CaretRightIcon size={verticalScale(iconSize)} color={color} weight='bold'/>
        </TouchableOpacity>
    )
}

export default ForwardButton

const styles = StyleSheet.create({
    button:{

    }
})