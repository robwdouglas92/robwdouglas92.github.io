// The text a creator copies into claude.ai to get an answer list for one
// prompt. Its reply format must stay in step with parseAnswerList() in
// gameFormat.js. There's no API call — Rizzie has no server, so the creator
// carries the text across by copy and paste.

const MAX_EXISTING_LISTED = 300;

export function buildClaudePrompt(promptText, existing = []) {
    const topUp = existing.length > 0;
    const already = existing.slice(0, MAX_EXISTING_LISTED).map(a => a.name).join('; ');

    return `I'm making a round for Rizzie, a family trivia game where the rarest correct answer wins. The players are a UK family of mixed ages. Each player has 25 seconds to type one answer.

The question is: "${promptText.trim()}"

${topUp
        ? `These answers are already on the list, so don't repeat them: ${already}.

Please add as many more genuinely correct answers as you can — especially the less obvious ones.`
        : 'Please list every reasonable correct answer you can — aim for 80 to 150, including obscure but genuinely valid ones (that’s where the big points are).'}

Give each answer a tier from 1 to 6 for how many of these players would think of it:
1 = most people's first thought (only a handful of answers)
2 = very common
3 = common
4 = less common
5 = rare
6 = only someone who really knows the topic would say it
Most answers should end up in tiers 4 to 6.

For each answer, add "aliases": other names or short forms people might type instead (for example "Home Alone 2" for "Home Alone 2: Lost in New York"). Don't add misspellings or plurals — the game already allows for typos, plurals, a missing "the", and "Xmas".

Only include answers that are definitely correct for the question. No duplicates.

Reply with only JSON, in exactly this format:
{"answers": [{"name": "Elf", "tier": 1, "aliases": []}, {"name": "Home Alone 2: Lost in New York", "tier": 2, "aliases": ["Home Alone 2"]}]}`;
}
