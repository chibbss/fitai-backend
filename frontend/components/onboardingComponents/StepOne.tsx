import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacingX, spacingY } from '@/constants/theme';
import Typo from '../Typo';
import Button from '@/components/Button'
import { verticalScale } from '@/utils/styling';
import Animated, { FadeIn } from 'react-native-reanimated';

interface StepOneProps {
  onNext: () => void;
}

const StepOne: React.FC<StepOneProps> = ({ onNext }) => {
  return (
    <View style={styles.container}>

      <Animated.Image
        entering={FadeIn.duration(700).springify()}
        source={require('../../assets/images/images/welcome.png')}
        style={styles.welcomeImage}
        resizeMode={'contain'}
      />

      <View style={styles.textContainer}>
        <Typo size={35} fontWeight={'700'} style={{ marginBottom: spacingY._10, textAlign: 'center' }}>
          Hello UserName
        </Typo>



        <Typo
          color={colors.neutral600}

          style={{ marginTop: spacingY._10, marginBottom: spacingY._40, textAlign: 'center' }}
        >
          Before we can begin, please answer a few quick questions.
        </Typo>
      </View>


      <View style={styles.actionContainer}>
        <Button onPress={onNext} style={styles.button}>
          <Typo

            fontWeight={'bold'}
            color={colors.black}
            size={18}>Okay</Typo>
        </Button>

        <View style={styles.footer}>
          <Typo color={colors.neutral500} style={{ marginTop: spacingY._10, marginBottom: spacingY._40, textAlign: 'center' }} size={14}>
            This helps us personalize your chat experience.
          </Typo>
        </View>

      </View>

    </View>
  );
};

export default StepOne;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacingY._15,
    paddingHorizontal: spacingX._15,
  },

  textContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacingX._20,
  },

  actionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacingY._35,
    gap: spacingY._15,
  },

  footer: {
    marginTop: spacingY._10,
    alignItems: 'center',
  },

  button: {
    width: '70%',
    height: verticalScale(56),
    backgroundColor: colors.primary,
  },
  welcomeImage: {
        height: verticalScale(270),
        aspectRatio: 1,
        alignSelf: 'center',
        marginBottom: spacingY._15,
    }
});
