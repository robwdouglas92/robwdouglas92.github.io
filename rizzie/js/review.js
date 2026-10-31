// Review of rejected tries: what the creator sees, and how scores change
// once they've decided. Pure logic, no DOM or Firebase, so it can be tested
// in Node.
import { matchAnswer, normalize } from './match.js';
import { pointsFor } from './tiers.js';

const keyOf = text => normalize(text).join(' ');

const isComplete = play => play.status === 'complete';

// Rejected tries still waiting for a decision, grouped so identical tries
// from different players are one row:
// [{ prompt: 2, key, text, players: ['Grandad', 'Tom'] }]
// A try drops out once it matches the list (approved) or is marked rejected.
export function buildQueue(game, plays) {
    const rejected = new Set((game.rejected || []).map(r => `${r.prompt}|${r.key}`));
    const groups = new Map();
    for (const play of plays.filter(isComplete)) {
        play.answers.forEach((answer, prompt) => {
            const seenThisAnswer = new Set();
            for (const text of answer?.attempts || []) {
                const key = keyOf(text);
                const id = `${prompt}|${key}`;
                if (!key || rejected.has(id) || seenThisAnswer.has(id)) continue;
                if (matchAnswer(text, game.prompts[prompt].answers)) continue;
                seenThisAnswer.add(id);
                const group = groups.get(id) || { prompt, key, text, players: [] };
                group.players.push(play.displayName);
                groups.set(id, group);
            }
        });
    }
    return [...groups.values()].sort((a, b) => a.prompt - b.prompt || b.players.length - a.players.length);
}

// Re-checks every try in a finished play against the (possibly longer) answer
// lists. For each prompt the player keeps whichever scores more: the answer
// they got at the time, or an earlier try that's since been approved. So an
// approval can only ever raise a score. Returns the updated play, or null if
// nothing changed.
export function rescorePlay(play, prompts) {
    let changed = false;
    const answers = play.answers.map((answer, i) => {
        if (!answer) return answer;
        let best = answer;
        for (const text of answer.attempts || []) {
            const match = matchAnswer(text, prompts[i].answers);
            if (match && pointsFor(match.tier) > best.points) {
                best = {
                    ...answer,
                    typed: text,
                    matched: match.name,
                    tier: match.tier,
                    points: pointsFor(match.tier),
                    approvedLater: true,
                };
            }
        }
        if (best !== answer) changed = true;
        return best;
    });
    if (!changed) return null;
    return { ...play, answers, total: answers.reduce((sum, a) => sum + (a?.points || 0), 0) };
}

export function rescoreAll(plays, prompts) {
    return plays.filter(isComplete).map(p => rescorePlay(p, prompts)).filter(Boolean);
}

export { keyOf };
