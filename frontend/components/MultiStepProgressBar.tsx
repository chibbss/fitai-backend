import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';

// Instead of import ...
const ProgressBarMultiStep = require('react-native-progress-bar-multi-step').default;

interface MultiStepProgressProps {
  page: number;
}

const MultiStepProgress: React.FC<MultiStepProgressProps> = ({ page }) => {
  

  const tabs = [
    { title: 'Welcome', pageNo: 1 },
    { title: 'Page2', pageNo: 2 },
    { title: 'Page3', pageNo: 3 },
  ];

  return (
    <View style={styles.container}>
      <ProgressBarMultiStep
        progressive={true}
        page={page}
        tabs={tabs.map((tab, index) => ({ ...tab, key: `${tab.title}-${index}` }))}
        finishedBackgroundColor={colors.primaryDark}
        inProgressBackgroundColor={colors.white}
        circleStyle={{ width: 48, height: 48 }}
        stepNumberStyle={{ color: 'black', fontWeight: 'bold', fontSize: 18 }}
        stepTitleStyle={{ fontSize: 16, fontWeight: '600' }}
        lineStyle={{ height: 3, width: 50, marginHorizontal: 10 }}
        containerStyle={{ marginTop: 10, width: '100%', height: 100 }}
      />
    </View>
  );
};

export default MultiStepProgress;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
