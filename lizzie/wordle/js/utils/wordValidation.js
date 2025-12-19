// Word validation using Free Dictionary API
// Cache validated words to reduce API calls
const validatedWords = new Set();
const invalidWords = new Set();

export async function isValidWord(word) {
    const upperWord = word.toUpperCase();
    
    // Check cache first
    if (validatedWords.has(upperWord)) {
        return true;
    }
    if (invalidWords.has(upperWord)) {
        return false;
    }
    
    // Must be exactly 5 letters
    if (word.length !== 5) {
        invalidWords.add(upperWord);
        return false;
    }
    
    // Validate with API
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
        
        if (response.ok) {
            validatedWords.add(upperWord);
            return true;
        } else {
            invalidWords.add(upperWord);
            return false;
        }
    } catch (error) {
        console.error('Word validation error:', error);
        // On network error, be permissive and allow the word
        // This prevents the game from breaking if the API is down
        return true;
    }
}

// Clear cache (useful for testing)
export function clearValidationCache() {
    validatedWords.clear();
    invalidWords.clear();
}
