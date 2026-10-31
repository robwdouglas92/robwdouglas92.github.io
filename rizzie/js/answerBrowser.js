// Browsing a long answer list on a phone: tier chips (All or one tier),
// a search box, and an A–Z strip that shows one letter at a time. Used for
// picking an answer ("Same as…" in Review) and for just looking (Results).
import { TIERS, tierInfo } from './tiers.js';
import { normalize } from './match.js';
import { esc } from './utils/html.js';

// With no letter or search chosen, lists longer than this ask you to narrow
// down first rather than drawing thousands of rows.
const SHOW_ALL_MAX = 150;
const SUGGESTIONS = 5;

// "The Grinch" files under G, like an index.
const sortKey = name => name.trim().toLowerCase().replace(/^(the|a|an)\s+/, '');
const letterOf = name => {
    const c = sortKey(name).normalize('NFD')[0] || '#';
    return /[a-z]/.test(c) ? c.toUpperCase() : '#';
};

function levenshtein(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

// Existing answers most like a player's try: shared words count most, then
// overall spelling closeness. Only reasonably close ones are offered.
function closest(text, answers) {
    const words = new Set(normalize(text));
    const compact = normalize(text).join('');
    if (!compact) return [];
    return answers
        .map(a => {
            let best = Infinity;
            for (const variant of [a.name, ...(a.aliases || [])]) {
                const tokens = normalize(variant);
                const shared = tokens.filter(t => words.has(t)).length;
                const v = tokens.join('');
                const distance = levenshtein(compact, v) / Math.max(compact.length, v.length, 1);
                best = Math.min(best, distance - shared);
            }
            return { a, score: best };
        })
        .filter(x => x.score < 0.5)
        .sort((x, y) => x.score - y.score)
        .slice(0, SUGGESTIONS)
        .map(x => x.a);
}

const pill = tier => `<span class="tier-pill tier-${tier}">${tierInfo(tier).name} · ${tierInfo(tier).points}</span>`;

// container: element to draw into. answers: [{ name, tier, aliases }].
// onPick(answer): if given, rows are tappable. suggestFor: text to find
// close matches for (picking only).
export function renderAnswerBrowser(container, answers, { onPick = null, suggestFor = '' } = {}) {
    const state = { tier: 0, letter: '', search: '' };
    const sorted = [...answers].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)));
    const suggestions = onPick && suggestFor ? closest(suggestFor, answers) : [];

    const row = a => onPick
        ? `<button type="button" class="ab-row" data-name="${esc(a.name)}"><span>${esc(a.name)}</span>${pill(a.tier)}</button>`
        : `<div class="ab-row"><span>${esc(a.name)}</span>${pill(a.tier)}</div>`;

    function filtered() {
        const q = state.search.trim().toLowerCase();
        return sorted.filter(a => (!state.tier || a.tier === state.tier)
            && (!state.letter || letterOf(a.name) === state.letter)
            && (!q || [a.name, ...(a.aliases || [])].some(v => v.toLowerCase().includes(q))));
    }

    function drawList() {
        const list = container.querySelector('.ab-list');
        const rows = filtered();
        const narrowed = state.letter || state.search.trim();
        if (!narrowed && rows.length > SHOW_ALL_MAX) {
            list.innerHTML = `<p class="hint">${rows.length} answers — search, or tap a letter to browse.</p>`;
        } else {
            list.innerHTML = rows.map(row).join('') || '<p class="hint">No answers match.</p>';
        }
        container.querySelectorAll('.ab-chip').forEach(c => c.classList.toggle('active', Number(c.dataset.tier) === state.tier));
        container.querySelectorAll('.ab-letter').forEach(l => l.classList.toggle('active', l.dataset.letter === state.letter));
        // Letters with nothing in the chosen tier are greyed out.
        const present = new Set(sorted.filter(a => !state.tier || a.tier === state.tier).map(a => letterOf(a.name)));
        container.querySelectorAll('.ab-letter').forEach(l => { l.disabled = !present.has(l.dataset.letter); });
    }

    const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
    container.innerHTML = `
        <div class="answer-browser">
            ${suggestions.length ? `
                <p class="ab-label">Closest matches</p>
                <div class="ab-suggestions">${suggestions.map(row).join('')}</div>
                <p class="ab-label">Or find it in the list</p>` : ''}
            <div class="ab-chips">
                <button type="button" class="ab-chip" data-tier="0">All ${answers.length}</button>
                ${TIERS.map(t => `<button type="button" class="ab-chip tier-chip-${t.tier}" data-tier="${t.tier}">${t.name} ${answers.filter(a => a.tier === t.tier).length}</button>`).join('')}
            </div>
            <input type="search" class="ab-search" placeholder="Search ${answers.length} answers…" aria-label="Search answers">
            <div class="ab-letters">
                ${letters.map(l => `<button type="button" class="ab-letter" data-letter="${l}">${l}</button>`).join('')}
            </div>
            <div class="ab-list"></div>
        </div>
    `;

    container.querySelectorAll('.ab-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            state.tier = Number(chip.dataset.tier);
            drawList();
        });
    });
    container.querySelectorAll('.ab-letter').forEach(btn => {
        btn.addEventListener('click', () => {
            state.letter = state.letter === btn.dataset.letter ? '' : btn.dataset.letter;
            drawList();
        });
    });
    container.querySelector('.ab-search').addEventListener('input', e => {
        state.search = e.target.value;
        drawList();
    });
    // One listener covers the suggestions and every row the list redraws.
    if (onPick) {
        container.addEventListener('click', e => {
            const btn = e.target.closest('.ab-row[data-name]');
            if (btn) onPick(answers.find(a => a.name === btn.dataset.name));
        });
    }
    drawList();
}
