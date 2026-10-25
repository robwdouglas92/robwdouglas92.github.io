// Answer matching: decides which (if any) answer on a prompt's list a typed
// answer counts as. Pure logic, no DOM or Firebase, so it can be tested in Node.
//
// Both the typed text and every listed answer (plus its aliases) go through
// the same normalisation, then get compared in stages from strictest to
// loosest. The best-ranked candidate across the whole list wins, so an exact
// match always beats a fuzzy one ("Home Alone" never loses to "Home Alone 2").

const LEADING_ARTICLES = new Set(['the', 'a', 'an']);

// Ignored when comparing word-by-word, so "Nightmare Before Christmas" still
// matches "The Nightmare Before Christmas" and "Jack Frost" isn't hurt by "and".
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'at', 'from', 'with', 'by']);

const SYNONYMS = {
    xmas: 'christmas',
    crimbo: 'christmas',
    chrimbo: 'christmas',
    st: 'saint',
    mr: 'mister',
    mrs: 'missus',
    dr: 'doctor',
    mt: 'mount',
    vs: 'versus',
    n: 'and',
};

const NUMBER_WORDS = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
    seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
    thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
    eighteen: '18', nineteen: '19', twenty: '20',
};

// Deliberately excludes "i" — too common as an ordinary word. Everything is
// applied to both sides equally, so mapping e.g. "x" to 10 is harmless.
const ROMAN = {
    ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9',
    x: '10', xi: '11', xii: '12',
};

function stem(token) {
    if (/^\d+$/.test(token)) return token;
    let t = token.replace(/ph/g, 'f');
    if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
    // Fold -ie/-y endings together so singular and plural land on the same
    // stem: pie/pies → pi, berry/berries → berri, cookie/cookies → cooki.
    if (t.endsWith('ie')) t = t.slice(0, -1);
    else if (t.length > 2 && t.endsWith('y')) t = t.slice(0, -1) + 'i';
    return t;
}

export function normalize(text) {
    const cleaned = String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // é → e
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/['’‘`]/g, '')                              // muppet's → muppets
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    if (!cleaned) return [];

    let tokens = cleaned.split(' ').map(t => {
        const swapped = SYNONYMS[t] || t;
        return NUMBER_WORDS[swapped] || ROMAN[swapped] || swapped;
    });
    if (tokens.length > 1 && LEADING_ARTICLES.has(tokens[0])) tokens = tokens.slice(1);
    return tokens.map(stem);
}

function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(
                prev[j] + 1,
                cur[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
        prev = cur;
    }
    return prev[b.length];
}

// Short words must be exact — "Elf" can't drift into "Elk".
function wordAllowance(len) {
    if (len <= 4) return 0;
    if (len <= 8) return 1;
    return 2;
}

function phraseAllowance(len) {
    if (len <= 4) return 0;
    if (len <= 8) return 1;
    if (len <= 14) return 2;
    return 3;
}

// How many important words may be missing from (or extra in) a long answer:
// none for 1-3 words, one for 4-6, two for 7+.
function missingAllowance(wordCount) {
    return Math.floor((wordCount - 1) / 3);
}

const numbersOf = tokens => tokens.filter(t => /^\d+$/.test(t)).sort().join(',');
const significant = tokens => {
    const sig = tokens.filter(t => !STOPWORDS.has(t));
    return sig.length ? sig : tokens;
};

// Lower rank = better match; null = no match.
function compare(typed, listed) {
    if (!typed.length || !listed.length) return null;

    // Numbers must always agree: "Home Alone" is not "Home Alone 2".
    if (numbersOf(typed) !== numbersOf(listed)) return null;

    if (typed.join(' ') === listed.join(' ')) return 0;

    const typedCompact = typed.join('');
    const listedCompact = listed.join('');
    if (typedCompact === listedCompact) return 1;        // "spiderman" vs "spider man"

    // Word-by-word, order-insensitive, each word allowed small typos.
    const a = significant(typed);
    const b = significant(listed);
    const used = new Set();
    let matched = 0;
    let typos = 0;
    for (const word of a) {
        let best = -1;
        let bestDist = Infinity;
        b.forEach((other, j) => {
            if (used.has(j)) return;
            const d = levenshtein(word, other);
            if (d <= wordAllowance(Math.max(word.length, other.length)) && d < bestDist) {
                best = j;
                bestDist = d;
            }
        });
        if (best >= 0) {
            used.add(best);
            matched++;
            typos += bestDist;
        }
    }
    const extraTyped = a.length - matched;
    const missingListed = b.length - matched;
    if (matched > 0
        && extraTyped <= missingAllowance(a.length)
        && missingListed <= missingAllowance(b.length)) {
        return 2 + extraTyped + missingListed + typos * 0.1;
    }

    // Last resort: whole phrase with a few wrong letters ("chrstmascarol").
    const d = levenshtein(typedCompact, listedCompact);
    if (d <= phraseAllowance(Math.max(typedCompact.length, listedCompact.length))) {
        return 5 + d;
    }
    return null;
}

// answers: [{ name, tier, aliases? }]. Returns the matched answer object, or null.
export function matchAnswer(typedText, answers) {
    const typed = normalize(typedText);
    if (!typed.length) return null;

    let best = null;
    let bestRank = Infinity;
    for (const answer of answers) {
        for (const variant of [answer.name, ...(answer.aliases || [])]) {
            const rank = compare(typed, normalize(variant));
            if (rank !== null && rank < bestRank) {
                best = answer;
                bestRank = rank;
                if (rank === 0) return best;
            }
        }
    }
    return best;
}
