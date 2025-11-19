import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { colors, radius } from '@/constants/theme';
import Typo from './Typo';

type MultiStepProgressBarProps = {
  steps: string[];       
  currentStep: number;   // 0-based index (0 for first step, 1 for second, etc.)
};

const MultiStepProgressBar = ({ steps, currentStep }: MultiStepProgressBarProps) => {
  const { colors: themeColors } = useTheme();

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.progressBar}>
          {steps.map((_, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            const isLast = index === steps.length - 1;

            return (
              <React.Fragment key={index}>
                <View style={styles.stepContainer}>
                  {isActive ? (
                    // Active step with gradient
                    <LinearGradient
                      colors={themeColors.accentGradient}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.gradientCircle}
                    >
                      <View style={styles.circleInner}>
                        <Typo
                          size={16}
                          fontWeight="700"
                          color={themeColors.background}
                        >
                          {index + 1}
                        </Typo>
                      </View>
                    </LinearGradient>
                  ) : isCompleted ? (
                    // Completed step - solid accent color
                    <View style={[styles.circle, { backgroundColor: themeColors.accentPrimary }]}>
                      <Typo
                        size={16}
                        fontWeight="700"
                        color={themeColors.background}
                      >
                        {index + 1}
                      </Typo>
                    </View>
                  ) : (
                    // Inactive step - border only
                    <View style={[styles.circle, styles.inactiveCircle, { borderColor: themeColors.border }]}>
                      <Typo
                        size={16}
                        fontWeight="700"
                        color={themeColors.textSecondary}
                      >
                        {index + 1}
                      </Typo>
                    </View>
                  )}
                </View>

                {/* Connecting line */}
                {!isLast && (
                  <View style={styles.lineContainer}>
                    <View
                      style={[
                        styles.line,
                        {
                          backgroundColor: index < currentStep
                            ? themeColors.accentPrimary
                            : themeColors.border,
                        },
                      ]}
                    />
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>
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
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circleInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveCircle: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  lineContainer: {
    width: 16,
    height: 3,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  line: {
    height: 3,
    width: 16,
  },
});