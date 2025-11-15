import { userApi } from './api';

/**
 * Helper to discover user data from chat messages
 * Call this after receiving bot responses to extract and store discovered information
 */
export const discoverFromChat = async (userMessage: string, botResponse: string) => {
    // Common patterns to detect user information
    const patterns = [
        {
            field: 'weight',
            regex: /(?:I (?:weigh|am|weight) (?:about |approximately )?)(\d+(?:\.\d+)?)\s*(?:kg|lbs?|pounds?)/i,
            context: 'User mentioned weight in chat',
        },
        {
            field: 'height',
            regex: /(?:I (?:am|measure) (?:about |approximately )?)(\d+(?:\.\d+)?)\s*(?:cm|feet|ft|inches?|in)/i,
            context: 'User mentioned height in chat',
        },
        {
            field: 'target_weight',
            regex: /(?:target|goal).*?(?:weight|weigh).*?(\d+(?:\.\d+)?)\s*(?:kg|lbs?|pounds?)/i,
            context: 'User mentioned target weight in chat',
        },
        {
            field: 'constraints',
            regex: /(?:can'?t|cannot|unable|busy|available).*?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekend)/i,
            context: 'User mentioned schedule constraints in chat',
        },
        {
            field: 'current_split',
            regex: /(?:I'?m (?:doing|running|following)|current (?:split|routine|program)).*?(?:PPL|push.*?pull.*?legs|upper.*?lower|full body|bro split)/i,
            context: 'User mentioned current training split in chat',
        },
        {
            field: 'equipment',
            regex: /(?:I have|I'?ve got|available).*?(?:dumbbells?|barbell|kettlebells?|resistance bands?|home gym|gym membership)/i,
            context: 'User mentioned available equipment in chat',
        },
    ];

    for (const pattern of patterns) {
        const match = userMessage.match(pattern.regex) || botResponse.match(pattern.regex);
        if (match) {
            try {
                await userApi.discoverData(
                    pattern.field,
                    match[1] || match[0], // Use captured group or full match
                    pattern.context
                );
                console.log(`Discovered ${pattern.field}:`, match[1] || match[0]);
            } catch (error) {
                console.warn(`Failed to discover ${pattern.field}:`, error);
            }
        }
    }
};
