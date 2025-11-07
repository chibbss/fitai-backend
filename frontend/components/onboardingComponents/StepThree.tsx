import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacingY } from '@/constants/theme';
import LottieView from 'lottie-react-native';
import Typo from '@/components/Typo';
import Button from '@/components/Button';
import { verticalScale } from '@/utils/styling';
import { useRouter } from 'expo-router';


const StepThree = () => {

  const animationRef = React.useRef<LottieView>(null);
  const router = useRouter();

  useEffect(() => {
    animationRef.current?.play();
  }, []);

  const handleFinish = () => {
    // navigate to chat screen 
    router.push('/chatscreen');
  };



  return (
    <View style={styles.container}>
      <LottieView
        ref={animationRef}
        source={require('../../assets/images/animations/Success.json')}
        autoPlay
        loop={false}
        style={styles.animation}
      />

      <Typo size={28} fontWeight="700" color={colors.primaryDark} style={{ marginTop: spacingY._10 }}>
        You’re All Set!
      </Typo>

      <Typo
        color={colors.neutral600}
        style={{ textAlign: 'center', marginTop: spacingY._5, marginBottom: spacingY._25 }}
      >
        Ready to begin your journey?
      </Typo>

      <Button onPress={handleFinish} style={styles.button}>
        <Typo fontWeight="bold" color={colors.black} size={18}>
          Finish
        </Typo>
      </Button>

    </View>
  );
};

export default StepThree;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  animation: {
    width: 250,
    height: 250,
  },
  button: {
    width: '70%',
    height: verticalScale(56),
    backgroundColor: colors.primary,
    marginTop: 30
  }
});
