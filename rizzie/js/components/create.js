// Building a game: a title plus 7 prompts, each with a tiered answer list.
// Saved as a draft as you go (players can't see drafts), then published.
import { fetchGame, createDraft, saveDraft, publishGame, deleteGame, getSession } from '../api.js';
import {
    parseGame, parseAnswerList, mergeAnswers, findClashes, publishProblems, cleanAnswer, SHORT_LIST,
} from '../gameFormat.js';
import { buildClaudePrompt } from '../claudePrompt.js';
import { TIERS, PROMPT_COUNT } from '../tiers.js';
import { router } from '../router.js';
import { app, esc, showMessage } from '../utils/html.js';

const SAVE_DELAY_MS = 1500;
const CLASHES_SHOWN = 5;
// Tier sections longer than this start folded, so a 100-answer list stays scrollable.
const OPEN_SECTION_MAX = 12;

const emptyGame = () => ({
    title: '',
    prompts: Array.from({ length: PROMPT_COUNT }, () => ({ text: '', answers: [] })),
});

const tierOptions = selected => TIERS
    .map(t => `<option value="${t.tier}" ${t.tier === selected ? 'selected' : ''}>${t.name}</option>`)
    .join('');

class CreateComponent {
    async render(gameId) {
        this.flush();
        this.id = gameId || null;
        this.view = 'overview';
        this.statusText = '';

        if (!gameId) {
            this.game = emptyGame();
            this.draw();
            return;
        }

        app().innerHTML = '<div class="loading">Loading draft…</div>';
        const game = await fetchGame(gameId);
        if (!game || game.createdBy !== getSession().id) {
            showMessage('Draft not found', 'This draft doesn’t exist, or isn’t yours.');
            return;
        }
        if (game.status !== 'draft') {
            showMessage('Already published', 'This game has been published, so it can’t be edited any more.');
            return;
        }
        this.game = {
            title: game.title || '',
            prompts: game.prompts.map(p => ({ text: p.text || '', answers: p.answers.map(cleanAnswer) })),
        };
        this.draw();
    }

    draw() {
        if (this.view === 'overview') this.drawOverview();
        else this.drawPrompt(this.view);
    }

    // ---- Saving: a short pause after each change, then one write ----

    changed() {
        this.setStatus('Unsaved changes…');
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY_MS);
    }

    // Called when leaving the page, so nothing typed in the last moment is lost.
    flush() {
        if (this.saveTimer) this.save();
    }

    async save() {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        if (this.saving) {
            this.dirty = true;
            return;
        }
        this.saving = true;
        this.dirty = false;
        this.setStatus('Saving…');
        try {
            if (this.id) {
                await saveDraft(this.id, this.game);
            } else {
                this.id = await createDraft(this.game);
                // So a refresh reopens this draft rather than a blank one.
                const url = new URL(window.location);
                url.searchParams.set('id', this.id);
                history.replaceState({}, '', url);
            }
            this.setStatus('Draft saved');
        } catch (err) {
            console.error(err);
            this.setStatus('Couldn’t save — check your connection', true);
        }
        this.saving = false;
        if (this.dirty) this.save();
    }

    setStatus(text, isError = false) {
        this.statusText = text;
        const el = document.getElementById('save-status');
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('error', isError);
    }

    // ---- Overview: title, the 7 prompts, publish ----

    drawOverview() {
        const { game } = this;
        app().innerHTML = `
            <div class="container">
                <header>
                    <h1>${this.id ? 'Edit draft' : 'Create a game'}</h1>
                    <p class="subtitle save-status" id="save-status">${esc(this.statusText || 'Saved as a draft as you go')}</p>
                </header>
                <div class="card">
                    <label for="title">Game title</label>
                    <input id="title" maxlength="60" placeholder="e.g. Christmas Classics" value="${esc(game.title)}">
                </div>

                <h2>Prompts</h2>
                ${game.prompts.map((p, i) => this.promptSlot(p, i)).join('')}

                <div id="publish-problems"></div>
                <button class="btn btn-primary btn-big" id="publish">Publish</button>

                <details class="card advanced">
                    <summary>Advanced: paste a whole game as JSON</summary>
                    <textarea id="game-json" rows="6" spellcheck="false" placeholder='{ "title": "…", "prompts": [ … ] }'></textarea>
                    <div class="row">
                        <button class="btn btn-secondary btn-small" id="load-sample">Load the sample Christmas game</button>
                        <button class="btn btn-secondary btn-small" id="use-json">Use this JSON</button>
                    </div>
                    <p class="error" id="json-error" role="alert"></p>
                </details>

                ${this.id ? '<button class="btn btn-secondary" id="delete-draft">Delete this draft</button>' : ''}
                <button class="btn btn-secondary" id="back">← Home</button>
            </div>
        `;

        document.getElementById('title').addEventListener('input', e => {
            game.title = e.target.value;
            this.changed();
        });
        app().querySelectorAll('[data-prompt]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.view = Number(btn.dataset.prompt);
                this.draw();
                window.scrollTo(0, 0);
            });
        });
        document.getElementById('publish').addEventListener('click', () => this.publish());
        document.getElementById('load-sample').addEventListener('click', async () => {
            const res = await fetch('sample-game.json');
            document.getElementById('game-json').value = await res.text();
        });
        document.getElementById('use-json').addEventListener('click', () => this.useJson());
        document.getElementById('delete-draft')?.addEventListener('click', () => this.deleteDraft());
        document.getElementById('back').addEventListener('click', () => router.navigate('home'));
    }

    promptSlot(p, i) {
        const count = p.answers.length;
        let state = 'empty';
        if (p.text.trim() && count >= SHORT_LIST) state = 'ready';
        else if (p.text.trim() || count) state = 'started';
        return `
            <button class="card prompt-slot slot-${state}" data-prompt="${i}">
                <span class="slot-num">${i + 1}</span>
                <span class="slot-body">
                    <span class="slot-text">${p.text.trim() ? esc(p.text) : '<em>Add a question</em>'}</span>
                    <span class="slot-meta">${count ? `${count} answers${count < SHORT_LIST ? ' · could use more' : ''}` : 'No answers yet'}</span>
                </span>
                <span class="slot-arrow">›</span>
            </button>
        `;
    }

    useJson() {
        const errorEl = document.getElementById('json-error');
        let parsed;
        try {
            parsed = parseGame(document.getElementById('game-json').value);
        } catch (err) {
            errorEl.textContent = err.message;
            return;
        }
        const hasWork = this.game.title.trim() || this.game.prompts.some(p => p.text.trim() || p.answers.length);
        if (hasWork && !confirm('Replace everything in this draft with the pasted game?')) return;
        this.game = parsed;
        this.changed();
        this.draw();
    }

    async publish() {
        const problems = publishProblems(this.game);
        const box = document.getElementById('publish-problems');
        if (problems.length) {
            box.innerHTML = `<div class="card warn"><p><strong>Not quite ready:</strong></p>
                <ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
            return;
        }
        const short = this.game.prompts.filter(p => p.answers.length < SHORT_LIST).length;
        const warning = short
            ? `\n\n${short} prompt${short === 1 ? ' has' : 's have'} fewer than ${SHORT_LIST} answers, so players may often hear “not on the list”.`
            : '';
        if (!confirm(`Publish “${this.game.title.trim()}”? Players can start straight away, and it can’t be edited afterwards.${warning}`)) return;

        const button = document.getElementById('publish');
        button.disabled = true;
        button.textContent = 'Publishing…';
        try {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
            const game = { ...this.game, title: this.game.title.trim() };
            if (!this.id) this.id = await createDraft(game);
            await publishGame(this.id, game);
            router.navigate('home');
        } catch (err) {
            console.error(err);
            box.innerHTML = '<p class="error">Couldn’t publish — check your connection and try again.</p>';
            button.disabled = false;
            button.textContent = 'Publish';
        }
    }

    async deleteDraft() {
        if (!confirm('Delete this draft? This can’t be undone.')) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        try {
            await deleteGame(this.id);
            router.navigate('home');
        } catch (err) {
            console.error(err);
            this.setStatus('Couldn’t delete — check your connection', true);
        }
    }

    // ---- One prompt: its question, Claude fill-out, and the answer list ----

    drawPrompt(index) {
        const prompt = this.game.prompts[index];
        const { answers } = prompt;
        const clashes = findClashes(answers);

        app().innerHTML = `
            <div class="container">
                <div class="editor-top">
                    <button class="btn btn-secondary btn-small" id="to-overview">← All prompts</button>
                    <span class="save-status" id="save-status">${esc(this.statusText)}</span>
                </div>
                <h1 class="editor-title">Prompt ${index + 1} of ${PROMPT_COUNT}</h1>

                <div class="card">
                    <label for="prompt-text">Question</label>
                    <input id="prompt-text" maxlength="120" placeholder="e.g. Name a Christmas film" value="${esc(prompt.text)}">
                </div>

                <div class="card claude-steps">
                    <h3>${answers.length ? 'Get more answers from Claude' : 'Fill the answer list with Claude'}</h3>
                    <p class="step"><span class="step-num">1</span> Copy the request, then paste it into a new Claude chat.</p>
                    <div class="row">
                        <button class="btn btn-primary btn-small" id="copy-claude">${answers.length ? 'Copy “more answers” request' : 'Copy request for Claude'}</button>
                        <a class="btn btn-secondary btn-small" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude ↗</a>
                    </div>
                    <p class="hint" id="copy-status"></p>
                    <textarea id="copy-fallback" rows="5" readonly hidden></textarea>
                    <p class="step"><span class="step-num">2</span> Copy Claude’s whole reply and paste it here.</p>
                    <textarea id="claude-reply" rows="4" spellcheck="false" placeholder="Paste Claude’s reply here"></textarea>
                    <button class="btn btn-primary" id="add-reply">Add these answers</button>
                    <p class="hint" id="reply-status" role="status"></p>
                </div>

                <div class="card">
                    <h3>Answers (${answers.length})</h3>
                    <p class="hint tier-counts">${TIERS.map(t => `${t.name} ${answers.filter(a => a.tier === t.tier).length}`).join(' · ')}</p>

                    <form class="add-answer" id="add-one" autocomplete="off">
                        <input id="new-name" placeholder="Add an answer" maxlength="80">
                        <select id="new-tier" aria-label="Tier">${tierOptions(4)}</select>
                        <button class="btn btn-secondary btn-small" type="submit">Add</button>
                    </form>
                    <p class="hint" id="add-status" role="status"></p>

                    ${clashes.length ? `
                        <div class="warn clashes">
                            <p><strong>Heads up — these would score as the wrong answer:</strong></p>
                            <ul>${clashes.slice(0, CLASHES_SHOWN).map(c => `
                                <li>Typing “${esc(c.typed)}” counts as <strong>${esc(c.countsAs)}</strong>, not ${esc(c.intended)}.</li>`).join('')}
                            </ul>
                            ${clashes.length > CLASHES_SHOWN ? `<p class="hint">…and ${clashes.length - CLASHES_SHOWN} more.</p>` : ''}
                            <p class="hint">Rename one of them, or delete the duplicate.</p>
                        </div>` : ''}

                    ${answers.length > 10 ? '<input id="filter" class="filter" placeholder="Search the list…">' : ''}
                    <div id="tier-sections">
                        ${TIERS.map(t => this.tierSection(t, answers)).join('')}
                    </div>
                </div>

                <button class="btn btn-secondary" id="to-overview-bottom">← All prompts</button>
            </div>
        `;
        this.bindPrompt(index);
    }

    tierSection(t, answers) {
        const rows = answers
            .map((a, i) => ({ a, i }))
            .filter(({ a }) => a.tier === t.tier)
            .sort((x, y) => x.a.name.localeCompare(y.a.name));
        return `
            <details class="tier-section" ${rows.length && rows.length <= OPEN_SECTION_MAX ? 'open' : ''}>
                <summary><span class="tier-pill tier-${t.tier}">${t.name} · ${t.points}</span> ${rows.length}</summary>
                ${rows.map(({ a, i }) => `
                    <div class="ans-row" data-index="${i}">
                        <div class="ans-main">
                            <input class="ans-name" value="${esc(a.name)}" aria-label="Answer" maxlength="80">
                            <select class="ans-tier" aria-label="Tier">${tierOptions(a.tier)}</select>
                            <button class="ans-del" aria-label="Delete ${esc(a.name)}">×</button>
                        </div>
                        <input class="ans-aliases" value="${esc(a.aliases.join(', '))}" placeholder="Other ways to say it, separated by commas">
                    </div>`).join('') || '<p class="hint">None yet.</p>'}
            </details>
        `;
    }

    bindPrompt(index) {
        const prompt = this.game.prompts[index];
        const { answers } = prompt;
        // Re-drawing after a tier change or delete shouldn't jump back to the top.
        const redraw = () => {
            const y = window.scrollY;
            this.drawPrompt(index);
            window.scrollTo(0, y);
        };
        const toOverview = () => {
            this.view = 'overview';
            this.draw();
            window.scrollTo(0, 0);
        };
        document.getElementById('to-overview').addEventListener('click', toOverview);
        document.getElementById('to-overview-bottom').addEventListener('click', toOverview);

        document.getElementById('prompt-text').addEventListener('input', e => {
            prompt.text = e.target.value;
            this.changed();
        });

        document.getElementById('copy-claude').addEventListener('click', async () => {
            const status = document.getElementById('copy-status');
            if (!prompt.text.trim()) {
                status.textContent = 'Write the question first.';
                return;
            }
            const text = buildClaudePrompt(prompt.text, answers);
            try {
                await navigator.clipboard.writeText(text);
                status.textContent = 'Copied! Now paste it into Claude.';
            } catch {
                // Some browsers block clipboard access — let them copy it by hand.
                const fallback = document.getElementById('copy-fallback');
                fallback.value = text;
                fallback.hidden = false;
                fallback.select();
                status.textContent = 'Couldn’t copy automatically — select all the text below and copy it.';
            }
        });

        document.getElementById('add-reply').addEventListener('click', () => {
            const status = document.getElementById('reply-status');
            let parsed;
            try {
                parsed = parseAnswerList(document.getElementById('claude-reply').value);
            } catch (err) {
                status.textContent = err.message;
                status.classList.add('error');
                return;
            }
            const added = mergeAnswers(answers, parsed.answers);
            const dupes = parsed.answers.length - added;
            this.changed();
            redraw();
            const notes = [dupes && `${dupes} already on the list`, parsed.skipped && `${parsed.skipped} skipped as incomplete`]
                .filter(Boolean).join(', ');
            document.getElementById('reply-status').textContent =
                `Added ${added} answer${added === 1 ? '' : 's'}${notes ? ` (${notes})` : ''}.`;
        });

        document.getElementById('add-one').addEventListener('submit', e => {
            e.preventDefault();
            const name = document.getElementById('new-name').value.trim();
            if (!name) return;
            const tier = Number(document.getElementById('new-tier').value);
            if (!mergeAnswers(answers, [{ name, tier, aliases: [] }])) {
                document.getElementById('new-name').value = '';
                document.getElementById('add-status').textContent = `“${name}” is already on the list.`;
                return;
            }
            this.changed();
            redraw();
            document.getElementById('new-name').focus();
        });

        app().querySelectorAll('.ans-row').forEach(row => {
            const answer = answers[Number(row.dataset.index)];
            row.querySelector('.ans-name').addEventListener('input', e => {
                answer.name = e.target.value;
                this.changed();
            });
            // Blank names are tidied away when you leave the box, not mid-typing.
            row.querySelector('.ans-name').addEventListener('change', e => {
                if (e.target.value.trim()) return;
                answers.splice(answers.indexOf(answer), 1);
                this.changed();
                redraw();
            });
            row.querySelector('.ans-aliases').addEventListener('input', e => {
                answer.aliases = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                this.changed();
            });
            row.querySelector('.ans-tier').addEventListener('change', e => {
                answer.tier = Number(e.target.value);
                this.changed();
                redraw();
            });
            row.querySelector('.ans-del').addEventListener('click', () => {
                answers.splice(answers.indexOf(answer), 1);
                this.changed();
                redraw();
            });
        });

        document.getElementById('filter')?.addEventListener('input', e => {
            const q = e.target.value.trim().toLowerCase();
            app().querySelectorAll('.tier-section').forEach(section => {
                if (q) section.open = true;
                section.querySelectorAll('.ans-row').forEach(row => {
                    const a = answers[Number(row.dataset.index)];
                    const hit = !q || [a.name, ...a.aliases].some(v => v.toLowerCase().includes(q));
                    row.hidden = !hit;
                });
            });
        });
    }
}

export const createComponent = new CreateComponent();
