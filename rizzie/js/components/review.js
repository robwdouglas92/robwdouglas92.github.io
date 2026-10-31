// The creator's review of players' rejected tries for one published game.
// Each decision updates the answer list and re-scores everyone straight away.
import { fetchGame, fetchPlays, applyReview, getSession } from '../api.js';
import { buildQueue, rescoreAll } from '../review.js';
import { TIERS } from '../tiers.js';
import { router } from '../router.js';
import { app, esc, showMessage } from '../utils/html.js';

const tierOptions = selected => TIERS
    .map(t => `<option value="${t.tier}" ${t.tier === selected ? 'selected' : ''}>${t.name} · ${t.points}</option>`)
    .join('');

class ReviewComponent {
    async render(gameId) {
        app().innerHTML = '<div class="loading">Loading tries…</div>';
        const me = getSession();
        const [game, plays] = await Promise.all([fetchGame(gameId), fetchPlays(gameId)]);
        if (!game || game.status !== 'published') {
            showMessage('Game not found', 'Only published games have tries to review.');
            return;
        }
        if (game.createdBy !== me.id && !me.isAdmin) {
            showMessage('Not your game', 'Only the person who made this game can review its answers.');
            return;
        }
        this.gameId = gameId;
        this.game = { ...game, rejected: game.rejected || [] };
        this.plays = plays;
        this.open = null;
        this.message = '';

        // Catch-up: someone may have finished after an answer was approved,
        // with a try that now counts. Quietly give them their points.
        const behind = rescoreAll(this.plays, this.game.prompts);
        if (behind.length) {
            try {
                await applyReview(gameId, this.game, behind);
                this.mergePlays(behind);
            } catch (err) {
                console.error(err);
            }
        }
        this.draw();
    }

    mergePlays(updated) {
        const byName = new Map(updated.map(p => [p.username, p]));
        this.plays = this.plays.map(p => byName.get(p.username) || p);
    }

    draw() {
        const queue = buildQueue(this.game, this.plays);
        this.queue = queue;
        const byPrompt = new Map();
        queue.forEach((item, i) => {
            if (!byPrompt.has(item.prompt)) byPrompt.set(item.prompt, []);
            byPrompt.get(item.prompt).push({ item, i });
        });

        app().innerHTML = `
            <div class="container">
                <header>
                    <h1>Review answers</h1>
                    <p class="subtitle">${esc(this.game.title)}</p>
                </header>
                <div class="card">
                    <p>These are tries players made that weren’t on your list.
                    Approving one updates everyone’s scores straight away — players keep whichever scores more,
                    so approving never costs anyone points.</p>
                </div>
                ${this.message ? `<p class="review-message" role="status">${this.message}</p>` : ''}
                <p class="error" id="review-error" role="alert"></p>

                ${queue.length ? [...byPrompt.entries()].map(([prompt, items]) => `
                    <div class="card">
                        <p class="prompt-label">Prompt ${prompt + 1}</p>
                        <p class="prompt-text prompt-text-small">${esc(this.game.prompts[prompt].text)}</p>
                        ${items.map(({ item, i }) => this.row(item, i)).join('')}
                    </div>
                `).join('') : '<div class="card"><p>Nothing to review — every try has been dealt with.</p></div>'}

                <button class="btn btn-secondary" id="results">See results</button>
                <button class="btn btn-secondary" id="back">← Home</button>
            </div>
        `;
        this.bind();
    }

    row(item, i) {
        const open = this.open?.index === i ? this.open.mode : null;
        const prompt = this.game.prompts[item.prompt];
        const existing = [...prompt.answers].sort((a, b) => a.name.localeCompare(b.name));
        return `
            <div class="review-row">
                <div class="review-try">
                    <strong>“${esc(item.text)}”</strong>
                    <span class="hint">${item.players.length} ${item.players.length === 1 ? 'player' : 'players'} · ${item.players.map(esc).join(', ')}</span>
                </div>
                <div class="review-actions">
                    <button class="btn btn-small ${open === 'add' ? 'btn-primary' : 'btn-secondary'}" data-open="add" data-i="${i}">Add as new answer</button>
                    <button class="btn btn-small ${open === 'same' ? 'btn-primary' : 'btn-secondary'}" data-open="same" data-i="${i}">Same as…</button>
                    <button class="btn btn-secondary btn-small" data-reject="${i}">Reject</button>
                </div>
                ${open === 'add' ? `
                    <form class="review-form" data-add="${i}">
                        <label>Answer as it should appear</label>
                        <input name="name" value="${esc(item.text)}" maxlength="80">
                        <label>Tier — how many people would think of it?</label>
                        <select name="tier">${tierOptions(4)}</select>
                        <button class="btn btn-primary" type="submit">Approve</button>
                    </form>` : ''}
                ${open === 'same' ? `
                    <form class="review-form" data-same="${i}">
                        <label>Another way of saying…</label>
                        <select name="answer">
                            ${existing.map(a => `<option value="${esc(a.name)}">${esc(a.name)} (${TIERS[a.tier - 1].name} · ${TIERS[a.tier - 1].points})</option>`).join('')}
                        </select>
                        <button class="btn btn-primary" type="submit">Approve</button>
                    </form>` : ''}
            </div>
        `;
    }

    bind() {
        app().querySelectorAll('[data-open]').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = Number(btn.dataset.i);
                const same = this.open?.index === index && this.open.mode === btn.dataset.open;
                this.open = same ? null : { index, mode: btn.dataset.open };
                this.message = '';
                this.draw();
            });
        });
        app().querySelectorAll('[data-add]').forEach(form => {
            form.addEventListener('submit', e => {
                e.preventDefault();
                const item = this.queue[Number(form.dataset.add)];
                const name = form.elements.name.value.trim();
                if (!name) return;
                const tier = Number(form.elements.tier.value);
                this.decide(item, prompts => {
                    prompts[item.prompt].answers.push({ name, tier, aliases: name === item.text ? [] : [item.text] });
                }, `Approved “${esc(name)}”`);
            });
        });
        app().querySelectorAll('[data-same]').forEach(form => {
            form.addEventListener('submit', e => {
                e.preventDefault();
                const item = this.queue[Number(form.dataset.same)];
                const target = form.elements.answer.value;
                this.decide(item, prompts => {
                    prompts[item.prompt].answers.find(a => a.name === target).aliases.push(item.text);
                }, `“${esc(item.text)}” now counts as ${esc(target)}`);
            });
        });
        app().querySelectorAll('[data-reject]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = this.queue[Number(btn.dataset.reject)];
                this.decide(item, null, `Rejected “${esc(item.text)}”`, true);
            });
        });
        document.getElementById('results').addEventListener('click', () => router.navigate('results', { id: this.gameId }));
        document.getElementById('back').addEventListener('click', () => router.navigate('home'));
    }

    // Works on a copy, writes it, and only then updates the screen — so a
    // failed save leaves everything as it was.
    async decide(item, changeList, summary, reject = false) {
        const prompts = structuredClone(this.game.prompts);
        const rejected = [...this.game.rejected];
        if (changeList) changeList(prompts);
        if (reject) rejected.push({ prompt: item.prompt, key: item.key });
        const rescored = reject ? [] : rescoreAll(this.plays, prompts);

        app().querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
            await applyReview(this.gameId, { prompts, rejected }, rescored);
        } catch (err) {
            console.error(err);
            app().querySelectorAll('button').forEach(b => { b.disabled = false; });
            document.getElementById('review-error').textContent = 'Couldn’t save that — check your connection and try again.';
            return;
        }
        this.game = { ...this.game, prompts, rejected };
        this.mergePlays(rescored);
        this.open = null;
        const gained = rescored.length;
        this.message = reject ? summary
            : `${summary} — ${gained} ${gained === 1 ? 'player’s score' : 'players’ scores'} went up.`;
        this.draw();
    }
}

export const reviewComponent = new ReviewComponent();
