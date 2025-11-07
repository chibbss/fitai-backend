import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/constants/theme';

// Keep using the library you already had installed
const ProgressBarMultiStep = require('react-native-progress-bar-multi-step').default;

type MultiStepProgressBarProps = {
  steps: string[];       
  currentStep: number;   // 0-based index (0 for first step, 1 for second, etc.)
};

const MultiStepProgressBar = ({ steps, currentStep }: MultiStepProgressBarProps) => {
  const tabs = steps.map((title, index) => ({
    title:'',
    pageNo: index + 1,         // library expects 1-based page numbers
    key: `${title}-${index}`,
  }));

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ProgressBarMultiStep
          progressive
          page={currentStep + 1}              
          tabs={tabs}
          finishedBackgroundColor={colors.primaryDark}
          inProgressBackgroundColor={colors.white}
          circleStyle={{ width: 50, height: 50 }}
          stepNumberStyle={{ color: colors.black, fontWeight: '700', fontSize: 16 }}
          stepTitleStyle={{ fontSize: 1, lineHeight: 1, color: 'transparent', marginTop: 0, opacity: 0 }}
          lineStyle={{ height: 3, width: 16, marginHorizontal: 4 }}
          containerStyle={{ paddingVertical: 12 }}
        />
      </ScrollView>
    </View>
  );
};

export default MultiStepProgressBar;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
});