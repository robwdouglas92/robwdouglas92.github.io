// The JSON shape a game is written in. Checking it in one place means a bad
// paste gets a readable error instead of a half-broken game.
//
// {
//   "title": "Christmas Classics",
//   "prompts": [                                   // exactly 7
//     { "text": "Name a Christmas film",
//       "answers": [
//         { "name": "Elf", "tier": 1 },              // tier 1 (obvious) to 6 (legendary)
//         { "name": "The Muppet Christmas Carol", "tier": 4,
//           "aliases": ["Muppets Christmas Carol"] } // optional other ways to say it
//       ] }
//   ]
// }
import { PROMPT_COUNT } from './tiers.js';
import { normalize, matchAnswer } from './match.js';

// Below this, players will hit "not on the list" a lot.
export const SHORT_LIST = 20;

// Returns a tidy { name, tier, aliases } or throws with a readable reason.
export function cleanAnswer(a) {
    const name = typeof a?.name === 'string' ? a.name.trim() : '';
    if (!name) throw new Error('an answer is missing its "name"');
    const tier = Number(a.tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 6) throw new Error(`“${name}” needs a tier from 1 to 6`);
    const aliases = Array.isArray(a.aliases)
        ? [...new Set(a.aliases.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()))]
        : [];
    return { name, tier, aliases };
}

export function parseGame(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('That isn’t valid JSON — check it was copied completely.');
    }

    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    if (!title) throw new Error('The game needs a "title".');
    if (!Array.isArray(data.prompts) || data.prompts.length !== PROMPT_COUNT) {
        throw new Error(`A game needs exactly ${PROMPT_COUNT} prompts (found ${data.prompts?.length ?? 0}).`);
    }

    const prompts = data.prompts.map((p, i) => {
        const where = `Prompt ${i + 1}`;
        const promptText = typeof p?.text === 'string' ? p.text.trim() : '';
        if (!promptText) throw new Error(`${where} is missing its "text".`);
        if (!Array.isArray(p.answers) || !p.answers.length) throw new Error(`${where} has no answers.`);
        const answers = p.answers.map(a => {
            try {
                return cleanAnswer(a);
            } catch (err) {
                throw new Error(`${where}: ${err.message}.`);
            }
        });
        return { text: promptText, answers };
    });

    return { title, prompts };
}

// Claude's reply to the copied prompt: ideally {"answers": [...]}, but it may
// arrive wrapped in ```json fences or with a sentence before it. Bad entries
// are skipped and counted rather than throwing the whole reply away.
export function parseAnswerList(text) {
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
    if (start < 0 || end < start) throw new Error('Couldn’t find a list of answers in that — copy Claude’s whole reply.');

    let data;
    try {
        data = JSON.parse(text.slice(start, end + 1));
    } catch {
        throw new Error('That doesn’t look complete — make sure you copied all of Claude’s reply.');
    }
    const raw = Array.isArray(data) ? data : data?.answers;
    if (!Array.isArray(raw)) throw new Error('Couldn’t find an "answers" list in that reply.');

    const answers = [];
    let skipped = 0;
    for (const a of raw) {
        try {
            answers.push(cleanAnswer(a));
        } catch {
            skipped++;
        }
    }
    if (!answers.length) throw new Error('None of the answers in that reply were usable.');
    return { answers, skipped };
}

const key = text => normalize(text).join(' ');

// Adds answers that aren't already on the list (by name or alias, after the
// same tidying the matcher does). Returns how many were new.
export function mergeAnswers(existing, incoming) {
    const seen = new Set(existing.flatMap(a => [a.name, ...a.aliases]).map(key));
    let added = 0;
    for (const a of incoming) {
        if ([a.name, ...a.aliases].some(v => seen.has(key(v)))) continue;
        existing.push(a);
        [a.name, ...a.aliases].forEach(v => seen.add(key(v)));
        added++;
    }
    return added;
}

// Spots entries the matcher would mix up: typing one answer (or one of its
// aliases) would be scored as a different answer on the list.
export function findClashes(answers) {
    const clashes = [];
    for (const a of answers) {
        for (const variant of [a.name, ...a.aliases]) {
            const hit = matchAnswer(variant, answers);
            if (hit && hit !== a) clashes.push({ typed: variant, intended: a.name, countsAs: hit.name });
        }
    }
    return clashes;
}

// What still needs doing before a draft can be published (empty = ready).
export function publishProblems({ title, prompts }) {
    const problems = [];
    if (!title.trim()) problems.push('Give the game a title.');
    prompts.forEach((p, i) => {
        if (!p.text.trim()) problems.push(`Prompt ${i + 1} needs its question.`);
        else if (!p.answers.length) problems.push(`Prompt ${i + 1} has no answers yet.`);
    });
    return problems;
}
