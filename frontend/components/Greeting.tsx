import { StyleSheet, View, TouchableOpacity } from 'react-native'
import React from 'react'
import { colors, radius, spacingX, spacingY } from '@/constants/theme'
import Typo from './Typo'
import * as Icons from 'phosphor-react-native'
import { useTheme } from '@/context/ThemeContext'

interface GreetingProps {
  gradientColors?: [string, string]
  onPromptPress?: (prompt: string) => void
}

interface FitnessPrompt {
  id: string
  label: string
  icon: keyof typeof Icons
  iconColor: string
  prompt: string
}

const FITNESS_PROMPTS: FitnessPrompt[] = [
  { id: '1', label: 'Create workout plan', icon: 'Barbell', iconColor: '#16a34a', prompt: 'Create a personalized workout plan for me' },
  { id: '2', label: 'Track progress', icon: 'ChartLineUp', iconColor: '#facc15', prompt: 'Help me track my fitness progress' },
  { id: '3', label: 'Nutrition advice', icon: 'ForkKnife', iconColor: '#f97316', prompt: 'Give me nutrition advice for my goals' },
  { id: '4', label: 'Recovery tips', icon: 'Heart', iconColor: '#8b5cf6', prompt: 'Share recovery and rest day tips' },
]

const Greeting = ({ gradientColors = ['#facc15', '#eab308'], onPromptPress }: GreetingProps) => {
  const { colors: themeColors } = useTheme()

  const handlePromptPress = (prompt: string) => {
    if (onPromptPress) {
      onPromptPress(prompt)
    }
  }

  return (
    <View style={styles.container}>
      {/* Centered content wrapper */}
      <View style={styles.contentWrapper}>
        {/* Header section */}
        <View style={styles.header}>
        <Typo size={34} color={themeColors.textPrimary} fontWeight="700" style={styles.title}>
            Ready to crush your fitness goals?
          </Typo>
        </View>

        {/* Prompt buttons in 2x2 grid */}
        <View style={styles.promptsContainer}>
          {FITNESS_PROMPTS.map((item) => {
            const IconComponent = Icons[item.icon] as React.ComponentType<any>
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.promptButton}
                onPress={() => handlePromptPress(item.prompt)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint={`Double tap to ${item.label.toLowerCase()}`}
              >
                <View style={styles.promptIconContainer}>
                  <IconComponent
                    size={24}
                    color={item.iconColor}
                    weight="regular"
                  />
                </View>
                <Typo
                  fontWeight="500"
                  color={colors.black}
                  size={15}
                  style={styles.promptText}
                >
                  {item.label}
                </Typo>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Refresh prompts moved closer to cards */}
        <View style={[styles.refreshRow, { opacity: 0.5 }]}>
          <Icons.ArrowCounterClockwiseIcon size={22} color={themeColors.textPrimary} />
          <Typo color={themeColors.textPrimary} style={styles.refreshText}>
            Refresh Prompts
          </Typo>
        </View>
      </View>
    </View>
  )
}

export default Greeting

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._20,
  },

  contentWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },

  header: {
    alignItems: 'center',
    marginBottom: spacingY._30,
  },

  title: {
    textAlign: 'center',
  },

  promptsContainer: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacingY._12,
    paddingHorizontal: spacingX._5,
  },

  promptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius._10,
    paddingVertical: spacingY._15,
    paddingHorizontal: spacingX._15,
    gap: spacingX._12,
    width: '48%',
    shadowColor: colors.black,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },

  promptIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  promptText: {
    flex: 1,
  },

  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacingY._20, // Reduced from paddingTop to marginTop, closer to cards
  },

  refreshText: {
    marginLeft: 4,
    fontSize: 16,
  },
})
