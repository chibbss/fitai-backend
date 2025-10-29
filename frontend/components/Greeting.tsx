import { StyleSheet, View } from 'react-native'
import React from 'react'
import { colors, radius, spacingX, spacingY } from '@/constants/theme'
import Typo from './Typo'
import Button from './Button'
import { verticalScale } from '@/utils/styling'
import * as Icons from 'phosphor-react-native'
import PromptButton from './PromptButton'

const Greeting = () => {
  return (
    <View style={styles.container}>
      {/* Header section */}
      <View style={styles.header}>
        <View style={styles.avatarWrapper}>
          <Icons.UserIcon size={verticalScale(56)} color={colors.black} />
        </View>

        <Typo size={34} color={colors.black} fontWeight="700" style={styles.title}>
          Good Day, User{'\n'}
          How can I assist you today?
        </Typo>

        <Typo color={colors.neutral400} style={styles.subtitle}>
          Choose a prompt below or type your own
        </Typo>
      </View>

      {/* Horizontal prompts */}
      <View style={styles.prompts}>
        <PromptButton style={styles.promptButton}>
          <Typo fontWeight="bold" color={colors.white} size={16} style={{
            textAlign: 'center', flexWrap: 'wrap',
          }}>
            Rewrite messages for maximum impact
          </Typo>
        </PromptButton>

        <PromptButton style={styles.promptButton}>
          <Typo fontWeight="bold" color={colors.white} size={16} style={{
            textAlign: 'center', flexWrap: 'wrap',
          }}>
            Brainstorm creative ideas
          </Typo>
        </PromptButton>
      </View>

      <View style={styles.refreshRow}>
        <Icons.ArrowCounterClockwiseIcon size={22} color={colors.neutral400} />
        <Typo color={colors.neutral400} style={styles.refreshText}>
          Refresh Prompts
        </Typo>
      </View>


    </View>
  )
}

export default Greeting

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: '100%',               
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._30,
    padding: spacingX._10,
    
  },

  header: {
    alignItems: 'center',
    marginTop: spacingY._30,
    marginBottom: spacingY._10
  },

  avatarWrapper: {
    width: verticalScale(80),
    height: verticalScale(80),
    borderRadius: verticalScale(40),
    borderWidth: 2,
    borderColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacingY._20,
  },

  title: {
    textAlign: 'center',
    marginBottom: spacingY._10,
  },

  subtitle: {
    textAlign: 'center',
  },

  prompts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: spacingX._15,
    width: '115%',
    paddingHorizontal: spacingX._5,
    marginBottom: spacingY._20,
    paddingTop: spacingY._20
  },

  promptButton: {
    flex: 1,
    borderRadius: radius._15,
    paddingVertical: spacingY._20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    minHeight: verticalScale(90),
  },

  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1, // adds space between icon and text (React Native 0.71+)
    paddingTop: spacingY._10,
  },

  refreshText: {
    marginLeft: 1, // fallback if `gap` isn’t supported
    fontSize: 16,
  },


})
