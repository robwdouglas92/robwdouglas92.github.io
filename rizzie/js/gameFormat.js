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
import { THEMES } from './themes/index.js';

// Below this, players will hit "not on the list" a lot.
export const SHORT_LIST = 20;

// The top tier is meant to be one answer per prompt — two or three at most.
export const LEGENDARY_MAX = 3;
export const NOTE_MAX = 280;

// Returns a tidy { name, tier, aliases, note? } or throws with a readable
// reason. note: an optional fun fact shown with the answer after playing.
export function cleanAnswer(a) {
    const name = typeof a?.name === 'string' ? a.name.trim() : '';
    if (!name) throw new Error('an answer is missing its "name"');
    const tier = Number(a.tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 6) throw new Error(`“${name}” needs a tier from 1 to 6`);
    const aliases = Array.isArray(a.aliases)
        ? [...new Set(a.aliases.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()))]
        : [];
    const note = typeof a.note === 'string' ? a.note.trim().slice(0, NOTE_MAX) : '';
    return note ? { name, tier, aliases, note } : { name, tier, aliases };
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

    // Optional; anything unrecognised is left for the editor's own choice.
    const theme = THEMES.some(t => t.id === data.theme) ? data.theme : undefined;
    return theme ? { title, prompts, theme } : { title, prompts };
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

// The reply to buildWholeGamePrompt(): one line per question, e.g.
//   {"number": 1, "answers": [["Elf", 1], ["Home Alone 2", 2, ["HA2"]]]}
// Also accepts a single {"prompts": [...]} object, and answers written as
// {name, tier, aliases} objects. A line that was cut off is reported by its
// question number rather than failing the whole paste.
// Returns { answersByPrompt: Map(index → answers), skipped, cutOff: [numbers] }.
export function parseWholeGameReply(text) {
    let lines = [];
    let cutOff = [];
    const fromPrompts = prompts => prompts.map((p, i) => ({ number: p.number ?? i + 1, answers: p.answers }));
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim().replace(/,$/, '');
        if (!line.startsWith('{')) continue;
        try {
            const obj = JSON.parse(line);
            if (Array.isArray(obj.prompts)) lines.push(...fromPrompts(obj.prompts));
            else lines.push(obj);
        } catch {
            const n = line.match(/"number"\s*:\s*(\d+)/);
            if (n) cutOff.push(Number(n[1]));
        }
    }
    // No line stood on its own: maybe it's one (possibly pretty-printed)
    // {"prompts": [...]} object instead.
    if (!lines.length) {
        try {
            const whole = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
            if (Array.isArray(whole?.prompts)) {
                lines = fromPrompts(whole.prompts);
                cutOff = [];
            }
        } catch {
            // Neither shape — reported below.
        }
    }
    if (!lines.length && !cutOff.length) {
        throw new Error('Couldn’t find any answer lists in that — copy the AI’s whole reply.');
    }

    const answersByPrompt = new Map();
    let skipped = 0;
    for (const line of lines) {
        const index = Number(line.number) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= PROMPT_COUNT || !Array.isArray(line.answers)) continue;
        const list = answersByPrompt.get(index) || [];
        for (const a of line.answers) {
            try {
                list.push(cleanAnswer(Array.isArray(a) ? { name: a[0], tier: a[1], aliases: a[2], note: a[3] } : a));
            } catch {
                skipped++;
            }
        }
        answersByPrompt.set(index, list);
    }
    return { answersByPrompt, skipped, cutOff };
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

// Works out what an AI's updated list would change, without changing anything:
// answers it moved to a different tier, new answers, and answers it left out.
// Answers are matched by name or other name. A match keeps the creator's own
// wording; only its tier changes, other names are added to, and a fun fact
// is filled in only if there wasn't one.
// Returns { apply(removeMissing) → new list, retiered, added, missing, noted }.
export function planListUpdate(existing, incoming) {
    const byVariant = new Map();
    for (const a of existing) for (const v of [a.name, ...a.aliases]) if (!byVariant.has(key(v))) byVariant.set(key(v), a);

    const updates = new Map();          // existing answer → its updated copy
    const added = [];
    const retiered = [];
    const noted = [];
    for (const inc of incoming) {
        const match = [inc.name, ...inc.aliases].map(v => byVariant.get(key(v))).find(Boolean);
        if (!match) {
            added.push(inc);
            continue;
        }
        if (updates.has(match)) continue;   // the AI listed it twice
        const next = { ...match, aliases: [...match.aliases] };
        if (inc.tier !== match.tier) {
            retiered.push({ name: match.name, from: match.tier, to: inc.tier });
            next.tier = inc.tier;
        }
        const known = new Set([next.name, ...next.aliases].map(key));
        for (const v of [inc.name, ...inc.aliases]) {
            if (!known.has(key(v))) {
                next.aliases.push(v);
                known.add(key(v));
            }
        }
        if (!match.note && inc.note) {
            next.note = inc.note;
            noted.push(match.name);
        }
        updates.set(match, next);
    }
    const missing = existing.filter(a => !updates.has(a));

    return {
        retiered,
        added,
        missing,
        noted,
        apply(removeMissing = false) {
            const list = existing
                .filter(a => !(removeMissing && !updates.has(a)))
                .map(a => updates.get(a) || { ...a, aliases: [...a.aliases] });
            mergeAnswers(list, added);
            return list;
        },
    };
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
