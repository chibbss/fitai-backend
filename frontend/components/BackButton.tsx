import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { colors } from '@/constants/theme'
import { BackButtonProps } from '@/types'
import { useRouter } from 'expo-router'
import {CaretLeft} from 'phosphor-react-native'
import { verticalScale } from '@/utils/styling'

const BackButton = ({
    style,
    iconSize = 26,
    color = colors.white
}: BackButtonProps) => {

    const router = useRouter();

    const handleBack = () => {
        try {
            if (router.canGoBack()) {
                router.back();
            } else {
                // If no history, navigate to welcome
                router.replace('/welcome');
            }
        } catch (error) {
            console.error('BackButton navigation error:', error);
            // Fallback to welcome screen
            router.replace('/welcome');
        }
    };

    return (
        <TouchableOpacity
            onPress={handleBack}
            style={[styles.button, style]}
            activeOpacity={0.7}
        >
            <CaretLeft size={verticalScale(iconSize)} color={color} weight='bold'/>
        </TouchableOpacity>
    )
}

export default BackButton

const styles = StyleSheet.create({
    button:{

    }
})