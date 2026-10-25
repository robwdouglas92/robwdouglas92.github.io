// The JSON shape a game is written in — by hand, or later pasted back from
// Claude. Checking it in one place means a bad paste gets a readable error
// instead of a half-broken game.
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

        const answers = p.answers.map((a, j) => {
            const name = typeof a?.name === 'string' ? a.name.trim() : '';
            if (!name) throw new Error(`${where}, answer ${j + 1} is missing its "name".`);
            if (!Number.isInteger(a.tier) || a.tier < 1 || a.tier > 6) {
                throw new Error(`${where}: “${name}” needs a tier from 1 to 6.`);
            }
            const aliases = Array.isArray(a.aliases)
                ? a.aliases.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim())
                : [];
            return { name, tier: a.tier, aliases };
        });
        return { text: promptText, answers };
    });

    return { title, prompts };
}
