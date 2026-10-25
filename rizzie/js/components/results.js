import { fetchGame, fetchPlays, getSession } from '../api.js';
import { PROMPT_COUNT, tierInfo } from '../tiers.js';
import { router } from '../router.js';
import { app, esc, showMessage } from '../utils/html.js';

const NOBODY_SAID_LIMIT = 6;
const TABS = [
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'answers', label: 'Answers' },
    { id: 'popular', label: 'Popular' },
];

const tierPill = tier => tier
    ? `<span class="tier-pill tier-${tier}">${tierInfo(tier).name} · ${tierInfo(tier).points}</span>`
    : '<span class="tier-pill tier-0">0</span>';

const triedLine = answer => answer.attempts?.length
    ? `<span class="tried">tried: ${answer.attempts.map(esc).join(', ')}</span>`
    : '';

const answerText = answer => answer.matched ? esc(answer.matched) : '<em>no answer</em>';

const isFinished = p => p.status === 'complete' || p.answers?.length === PROMPT_COUNT;

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

class ResultsComponent {
    async render(gameId) {
        app().innerHTML = '<div class="loading">Loading results…</div>';
        this.me = getSession();
        const [game, plays] = await Promise.all([fetchGame(gameId), fetchPlays(gameId)]);
        if (!game) {
            showMessage('Game not found', 'This game doesn’t exist, or has been removed.');
            return;
        }

        const mine = game.createdBy === this.me.id;
        const myPlay = plays.find(p => p.username === this.me.id);
        // Answers stay hidden until you've played, so nothing gets spoiled.
        // The creator wrote the list, so they can always look.
        if (!mine && !(myPlay && isFinished(myPlay))) {
            router.navigate('play', { id: gameId });
            return;
        }

        this.game = game;
        this.finished = plays.filter(isFinished);
        this.ranked = this.finished.filter(p => p.username !== game.createdBy).sort((a, b) => b.total - a.total);
        this.creatorPlay = this.finished.find(p => p.username === game.createdBy);
        this.stillPlaying = plays.length - this.finished.length;
        this.tab = 'leaderboard';
        this.openPlayer = null;

        app().innerHTML = `
            <div class="container">
                <header>
                    <h1>${esc(game.title)}</h1>
                    <p class="subtitle">By ${esc(game.createdByName)}</p>
                </header>

                ${myPlay && isFinished(myPlay) ? `
                    <div class="card my-score">
                        <div class="my-score-total">${myPlay.total}</div>
                        <div>points${mine ? ' (just for fun)' : this.rankText()}</div>
                    </div>
                ` : ''}

                <div class="tabs results-tabs" role="tablist">
                    ${TABS.map(t => `<button class="tab" role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}
                </div>
                <div id="tab-body"></div>

                <button class="btn btn-secondary" id="home">← Home</button>
            </div>
        `;
        app().querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tab = btn.dataset.tab;
                this.renderTab();
            });
        });
        document.getElementById('home').addEventListener('click', () => router.navigate('home'));
        this.renderTab();
    }

    renderTab() {
        app().querySelectorAll('[data-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === this.tab);
            btn.setAttribute('aria-selected', btn.dataset.tab === this.tab);
        });
        const body = document.getElementById('tab-body');
        if (this.tab === 'leaderboard') body.innerHTML = this.leaderboardTab();
        else if (this.tab === 'answers') body.innerHTML = this.game.prompts.map((p, i) => this.answersBlock(p, i)).join('');
        else body.innerHTML = this.game.prompts.map((p, i) => this.popularBlock(p, i)).join('');

        body.querySelectorAll('[data-player]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openPlayer = this.openPlayer === btn.dataset.player ? null : btn.dataset.player;
                this.renderTab();
            });
        });
    }

    // Tied scores share a rank: 120, 100, 100, 80 → 1, 2, 2, 4.
    rankOf(i) {
        return this.ranked.findIndex(p => p.total === this.ranked[i].total) + 1;
    }

    rankText() {
        const i = this.ranked.findIndex(p => p.username === this.me.id);
        return i < 0 ? '' : ` · ${ordinal(this.rankOf(i))} of ${this.ranked.length}`;
    }

    // ---- Leaderboard: tap a player to see their answers ----

    leaderboardTab() {
        return `
            <div class="card">
                ${this.ranked.length ? `
                    <ol class="leaderboard">
                        ${this.ranked.map((p, i) => this.playerRow(p, this.rankOf(i))).join('')}
                    </ol>
                    <p class="hint">Tap a player to see their answers.</p>
                ` : '<p>Nobody has finished yet.</p>'}
                ${this.creatorPlay ? `
                    <p class="lb-section">Just for fun</p>
                    <ol class="leaderboard">${this.playerRow(this.creatorPlay, '–', ' (creator)')}</ol>
                ` : ''}
                ${this.stillPlaying ? `<p class="hint">${this.stillPlaying} still playing.</p>` : ''}
            </div>
        `;
    }

    playerRow(play, rank, note = '') {
        const open = this.openPlayer === play.username;
        return `
            <li class="${play.username === this.me.id ? 'me' : ''}">
                <button class="lb-row" data-player="${esc(play.username)}" aria-expanded="${open}">
                    <span class="lb-rank">${rank}</span>
                    <span class="lb-name">${esc(play.displayName)}${note}</span>
                    <span class="lb-total">${play.total}</span>
                    <span class="lb-chevron">${open ? '▴' : '▾'}</span>
                </button>
                ${open ? `
                    <ol class="player-answers">
                        ${this.game.prompts.map((prompt, i) => {
                            const answer = play.answers[i];
                            return `
                                <li>
                                    <span class="pa-prompt">${esc(prompt.text)}</span>
                                    <span class="pa-answer">
                                        <span>${answer ? answerText(answer) : '<em>no answer</em>'}${answer ? triedLine(answer) : ''}</span>
                                        ${tierPill(answer?.tier ?? 0)}
                                    </span>
                                </li>`;
                        }).join('')}
                    </ol>
                ` : ''}
            </li>
        `;
    }

    // ---- Answers: everyone's answer, prompt by prompt ----

    answersBlock(prompt, index) {
        const rows = this.finished
            .map(p => ({ player: p, answer: p.answers[index] }))
            .filter(r => r.answer)
            .sort((a, b) => b.answer.points - a.answer.points);
        const byTier = [...prompt.answers].sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));

        return `
            <div class="card prompt-block">
                <p class="prompt-label">Prompt ${index + 1}</p>
                <p class="prompt-text prompt-text-small">${esc(prompt.text)}</p>
                <ul class="answer-rows">
                    ${rows.map(({ player, answer }) => `
                        <li class="${player.username === this.me.id ? 'me' : ''}">
                            <span class="ar-name">${esc(player.displayName)}</span>
                            <span class="ar-answer">${answerText(answer)}${triedLine(answer)}</span>
                            ${tierPill(answer.tier)}
                        </li>`).join('') || '<li class="hint">No answers yet.</li>'}
                </ul>
                <details>
                    <summary>All ${prompt.answers.length} answers on the list</summary>
                    <ul class="full-list">
                        ${byTier.map(a => `<li><span>${esc(a.name)}</span>${tierPill(a.tier)}</li>`).join('')}
                    </ul>
                </details>
            </div>
        `;
    }

    // ---- Popular: which answers people actually went for ----

    popularBlock(prompt, index) {
        const counts = new Map();
        for (const play of this.finished) {
            const answer = play.answers[index];
            if (!answer?.matched) continue;
            const entry = counts.get(answer.matched) || { name: answer.matched, tier: answer.tier, players: [] };
            entry.players.push(play.displayName);
            counts.set(answer.matched, entry);
        }
        const popular = [...counts.values()].sort((a, b) => b.players.length - a.players.length || a.tier - b.tier);
        const missed = this.finished.filter(p => !p.answers[index]?.matched).length;
        const nobodySaid = prompt.answers
            .filter(a => !counts.has(a.name))
            .sort((a, b) => b.tier - a.tier)
            .slice(0, NOBODY_SAID_LIMIT);

        return `
            <div class="card prompt-block">
                <p class="prompt-label">Prompt ${index + 1}</p>
                <p class="prompt-text prompt-text-small">${esc(prompt.text)}</p>
                <ul class="answer-rows">
                    ${popular.map(e => `
                        <li>
                            <span class="pop-count">${e.players.length}×</span>
                            <span class="ar-answer">${esc(e.name)}<span class="tried">${e.players.map(esc).join(', ')}</span></span>
                            ${tierPill(e.tier)}
                        </li>`).join('') || '<li class="hint">No answers counted yet.</li>'}
                </ul>
                ${missed ? `<p class="hint">${missed} ${missed === 1 ? 'player' : 'players'} didn’t get one on the list.</p>` : ''}
                ${nobodySaid.length ? `
                    <p class="nobody-label">Nobody said…</p>
                    <p class="nobody">${nobodySaid.map(a => `${esc(a.name)} <span class="nobody-points">${tierInfo(a.tier).points}</span>`).join(' · ')}</p>
                ` : ''}
            </div>
        `;
    }
}

export const resultsComponent = new ResultsComponent();
