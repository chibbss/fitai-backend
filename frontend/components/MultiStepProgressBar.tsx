import { useTheme } from '@/context/ThemeContext';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';


type MultiStepProgressBarProps = {
  steps: string[];
  currentStep: number;
};
const MultiStepProgressBar = ({ steps, currentStep }: MultiStepProgressBarProps) => {
  const { colors: themeColors } = useTheme();

  return (
    <View style={styles.container}>
      {steps.map((_, index) => (
        <Animated.View
          key={index}
          style={[
            styles.segment,
            { backgroundColor: index <= currentStep ? themeColors.accent : themeColors.cardElevated }
          ]}
        />
      ))}
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
});


export default MultiStepProgressBar;