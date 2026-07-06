import { radius, spacingX } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import React from 'react';
import { View, ViewProps } from 'react-native';

type CardProps = ViewProps & {
    elevated?: boolean; // nested card (set rows, inputs on a card)
    padded?: boolean;   // default true; pass false for edge-to-edge content
};

const Card = ({ style, elevated = false, padded = true, children, ...rest }: CardProps) => {
    const { colors } = useTheme();
    return (
        <View
            style={[
                {
                    backgroundColor: elevated ? colors.cardElevated : colors.card,
                    borderRadius: radius._20,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: padded ? spacingX._20 : 0,
                },
                style,
            ]}
            {...rest}
        >
            {children}
        </View>
    );
};

export default Card;