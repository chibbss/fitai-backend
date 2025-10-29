import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import React, { useState } from 'react'
import ScreenWrapper from '@/components/ScreenWrapper'
import BackButton from '@/components/BackButton'
import Typo from '@/components/Typo'
import ForwardButton from '@/components/ForwardButton'
import { colors, radius, spacingX, spacingY } from '@/constants/theme'
import MultiStepProgress from '@/components/MultiStepProgressBar'
import { useRouter } from 'expo-router'
import StepOne from '@/components/onboardingComponents/StepOne'
import StepTwo from '@/components/onboardingComponents/StepTwo'
import StepThree from '@/components/onboardingComponents/StepThree'

const onboarding = () => {
  const [page, setPage] = useState(1);
  const router = useRouter();

  const handleNext = () => {
    if (page < 3) setPage(page + 1);
    else router.push('/(auth)/welcome'); // navigate after final step
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS == 'ios' ? 'padding' : 'height'}
    >
      <ScreenWrapper showPattern={true}>

        <View style={styles.container}>

          <View style={styles.header}>
            <MultiStepProgress page={page} />
          </View>

          <View style={styles.content}>
            <ScrollView
              contentContainerStyle={styles.form}
              showsVerticalScrollIndicator={false}
            >
              {page === 1 && <StepOne onNext={handleNext} />}
              {page === 2 && <StepTwo onNext={handleNext} />}
              {page === 3 && <StepThree  />}
            </ScrollView>

          </View>

        </View>

      </ScreenWrapper>

    </KeyboardAvoidingView>
  )
}

export default onboarding

const styles = StyleSheet.create({
  container: {
    flex: 1,
    //gap: spacingY._30,
    // marginHorizontal: spacingX._20,
    justifyContent: 'space-between',

  },

  header: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._15,
    paddingBottom: spacingY._25,
    flexDirection: 'row',
    alignItems: 'center'
  },

  content: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius._50,
    borderTopRightRadius: radius._50,
    borderCurve: 'continuous',
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._20
  },

  form: {
    gap: spacingY._15,
    marginTop: spacingY._20
  },
})