// Word validation against a local, bundled word list.
// Previously called the Free Dictionary API (api.dictionaryapi.dev) over the
// network, which went unresponsive (hung with no response, no error) and
// froze the game on "Validating word...". Validating locally removes that
// external dependency entirely - instant, offline, and can't hang or go down.
import { WORD_LIST } from './words.js';

const VALID_WORDS = new Set(WORD_LIST);

export async function isValidWord(word) {
    const upperWord = word.toUpperCase();

    // Must be exactly 5 letters
    if (upperWord.length !== 5) {
        return false;
    }

    return VALID_WORDS.has(upperWord);
}

// Kept for API compatibility with any existing callers; no-op now that
// validation is a plain Set lookup with nothing to cache.
export function clearValidationCache() {}
