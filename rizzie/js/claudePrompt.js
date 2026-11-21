// The text a creator copies into claude.ai to get an answer list for one
// prompt. Its reply format must stay in step with parseAnswerList() in
// gameFormat.js. There's no API call — Rizzie has no server, so the creator
// carries the text across by copy and paste.

const MAX_EXISTING_LISTED = 300;

const CONTEXT = "I'm making a round for Rizzie, a family trivia game where the rarest correct answer wins. The players are a UK family of mixed ages. Each player has 25 seconds to type one answer to each question.";

const TIERS_GUIDE = `Give each answer a tier from 1 to 6 for how many of these players would think of it:
1 = most people's first thought (only a handful of answers)
2 = very common
3 = common
4 = less common
5 = rare
6 = legendary: the single most obscure answer that's still definitely correct
Give tier 6 to exactly one answer per question — two or three at the very most, and only if they're equally obscure. Most other answers should end up in tiers 3 to 5.

For each tier 6 answer, add a "note": one or two short sentences of fun background explaining it. Players see it after they finish the game, so make it something they'd enjoy learning.`;

// Long lists are split across several lines (same "number") so a reply that
// runs out of room only loses the line it stopped on.
const ANSWERS_PER_LINE = 60;
const LINE_FORMAT = `Each line is JSON in exactly this shape, with each answer as [name, tier] or [name, tier, [other names]], and each tier 6 answer as [name, 6, [other names], "note"]:
{"number": 1, "answers": [["Elf", 1], ["Home Alone 2: Lost in New York", 2, ["Home Alone 2"]], ["Name of the legendary answer", 6, [], "One or two sentences of fun background."]]}
Put at most ${ANSWERS_PER_LINE} answers on a line — for longer lists, use several lines with the same "number".

If you run out of room, finish the line you're on and stop — I'll ask you to continue.`;

// One request covering every question in a draft. With hundreds of answers per
// question a reply can run out of room, so the AI writes one compact line per
// question: a cut-off reply still gives every finished question, and "continue"
// picks up where it stopped. Parsed by parseWholeGameReply() in gameFormat.js.
export function buildWholeGamePrompt(game) {
    const questions = game.prompts
        .map((p, i) => ({ number: i + 1, text: p.text.trim(), existing: p.answers }))
        .filter(q => q.text);

    const list = questions.map(q => {
        const already = q.existing.slice(0, MAX_EXISTING_LISTED).map(a => a.name).join('; ');
        const hasLegendary = q.existing.some(a => a.tier === 6);
        return `${q.number}. "${q.text}"${already ? `\n   Already on the list, so don't repeat these: ${already}` : ''}${hasLegendary ? "\n   This one already has its legendary answer, so don't add another tier 6." : ''}`;
    }).join('\n');

    return `${CONTEXT}

The questions are:
${list}

For each question, list every reasonable correct answer you can — aim for 100 to 200 or more, including obscure but genuinely valid ones (that's where the big points are). Only include answers that are definitely correct for that question. No duplicates.

${TIERS_GUIDE}

Where people might type an answer differently, add the other names or short forms (for example "Home Alone 2" for "Home Alone 2: Lost in New York"). Don't add misspellings or plurals — the game already allows for typos, plurals, a missing "the", and "Xmas".

Reply with the lists and nothing else. ${LINE_FORMAT}`;
}

// An answer in the compact line format: [name, tier, [other names], "note"],
// leaving off the end parts it doesn't need.
function compact(a) {
    const out = [a.name, a.tier];
    if (a.aliases.length || a.note) out.push(a.aliases);
    if (a.note) out.push(a.note);
    return out;
}

// The current lists as reply-format lines, so the AI can hand them back changed.
function exportLines(game, indexes) {
    return indexes.flatMap(i => {
        const answers = game.prompts[i].answers;
        const lines = [];
        for (let start = 0; start < Math.max(answers.length, 1); start += ANSWERS_PER_LINE) {
            lines.push(JSON.stringify({ number: i + 1, answers: answers.slice(start, start + ANSWERS_PER_LINE).map(compact) }));
        }
        return lines;
    }).join('\n');
}

// Exports existing answer lists for the AI to work on.
// mode 'resort': re-tier everything and reply with the full lists.
// mode 'chat': talk it through first, then give the full lists when asked.
// The reply is read by parseWholeGameReply() and applied through
// planListUpdate(), which shows the creator the changes before anything moves.
export function buildExportPrompt(game, indexes, mode) {
    const questions = indexes.map(i => `${i + 1}. "${game.prompts[i].text.trim()}" (${game.prompts[i].answers.length} answers)`).join('\n');
    const plural = indexes.length > 1;
    const intro = `${CONTEXT}

${plural ? 'These are the questions' : 'This is the question'}:
${questions}

Here ${plural ? 'are the current answer lists' : 'is the current answer list'}, one JSON line per question (long lists run over several lines with the same "number"):
${exportLines(game, indexes)}

${TIERS_GUIDE}

Where people might type an answer differently, list the other names or short forms. Don't add misspellings or plurals — the game already allows for typos, plurals, a missing "the", and "Xmas".`;

    if (mode === 'chat') {
        return `${intro}

I'd like your help improving ${plural ? 'these lists' : 'this list'}: whether the tiers feel right for this family, any answers that are wrong or too much of a stretch, good answers that are missing, and which one answer deserves tier 6. Let's talk it through first — don't give me the full ${plural ? 'lists' : 'list'} yet.

When I say "final list", reply with the complete updated ${plural ? 'lists' : 'list'} and nothing else, in exactly the same format as above. Include every answer we're keeping, not just the changes. ${LINE_FORMAT}`;
    }

    return `${intro}

Please re-sort the tiers. Keep every answer and its other names exactly as written — only change the tier numbers, and add a "note" to the tier 6 answer if it doesn't have one. Keep any notes that are already there.

Reply with the complete updated ${plural ? 'lists' : 'list'} and nothing else, including every answer. ${LINE_FORMAT}`;
}

export function buildClaudePrompt(promptText, existing = []) {
    const topUp = existing.length > 0;
    const already = existing.slice(0, MAX_EXISTING_LISTED).map(a => a.name).join('; ');

    return `I'm making a round for Rizzie, a family trivia game where the rarest correct answer wins. The players are a UK family of mixed ages. Each player has 25 seconds to type one answer.

The question is: "${promptText.trim()}"

${topUp
        ? `These answers are already on the list, so don't repeat them: ${already}.

Please add as many more genuinely correct answers as you can — especially the less obvious ones. If one of the answers above is already the legendary one, don't add another tier 6 answer.`
        : 'Please list every reasonable correct answer you can — aim for 80 to 150, including obscure but genuinely valid ones (that’s where the big points are).'}

${TIERS_GUIDE}

For each answer, add "aliases": other names or short forms people might type instead (for example "Home Alone 2" for "Home Alone 2: Lost in New York"). Don't add misspellings or plurals — the game already allows for typos, plurals, a missing "the", and "Xmas".

Only include answers that are definitely correct for the question. No duplicates.

Reply with only JSON, in exactly this format:
{"answers": [{"name": "Elf", "tier": 1, "aliases": []}, {"name": "Home Alone 2: Lost in New York", "tier": 2, "aliases": ["Home Alone 2"]}, {"name": "Name of the legendary answer", "tier": 6, "aliases": [], "note": "One or two sentences of fun background."}]}`;
}
