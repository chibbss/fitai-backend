import React, { useRef } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Typo from '@/components/Typo';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { colors, spacingX, spacingY, radius } from '@/constants/theme';
import { verticalScale } from '@/utils/styling';
import * as Icons from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

interface StepTwoProps {
  onNext: () => void;
}

const StepTwo: React.FC<StepTwoProps> = ({ onNext }) => {
  const goalRef = useRef('');
  const timeRef = useRef('');
  const motivationRef = useRef('');

  const handleNext = () => {
    if (!goalRef.current || !timeRef.current || !motivationRef.current) {
      alert('Please fill all fields before continuing.');
      return;
    }
    onNext();
  };

  const router = useRouter();

  

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.wrapper}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          
          <View style={styles.header}>
            <Typo size={28} fontWeight="700">
              Questions
            </Typo>
            <Typo color={colors.neutral600} style={{ textAlign: 'center', marginTop: spacingY._5 }}>
              Lorem ipsum dolor sit amet consectetur adipisicing elit.
            </Typo>
          </View>

          <View style={styles.form}>
            <Input
              placeholder="What do you want to achieve?"
              onChangeText={(value: string) => (goalRef.current = value)}
              icon={
                <Icons.Question size={verticalScale(24)} color={colors.neutral600} />
              }
            />

            <Input
              placeholder="How soon do you want to achieve it?"
              onChangeText={(value: string) => (timeRef.current = value)}
              icon={
                <Icons.Question size={verticalScale(24)} color={colors.neutral600} />
              }
            />

            <Input
              placeholder="What motivates you?"
              onChangeText={(value: string) => (motivationRef.current = value)}
              icon={
                <Icons.Question size={verticalScale(24)} color={colors.neutral600} />
              }
            />


          </View>
        </ScrollView>

        <View style={styles.actionContainer}>
          <Button onPress={() => router.back()} style={styles.button}>
            <Typo fontWeight="bold" color={colors.black} size={18}>
              Previous
            </Typo>
          </Button>

          <Button onPress={handleNext} style={styles.button}>
            <Typo fontWeight="bold" color={colors.black} size={18}>
              Next
            </Typo>
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default StepTwo;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius._50,
    borderTopRightRadius: radius._50,
    borderCurve: 'continuous',
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._25,
  },
  scrollContent: {
    paddingBottom: spacingY._20,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacingY._25,
  },
  form: {
    gap: spacingY._15,
  },
  actionContainer: {
    marginTop: spacingY._20,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
  button: {
    width: '45%',
    height: verticalScale(56),
    backgroundColor: colors.primary,
    marginBottom: spacingY._20,
  },
  welcomeImage: {
    height: verticalScale(270),
    aspectRatio: 1,
    alignSelf: 'center',
    marginBottom: spacingY._15,
  }
});
