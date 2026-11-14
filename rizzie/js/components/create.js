// Building a game: a title plus 7 prompts, each with a tiered answer list.
// Saved as a draft as you go (players can't see drafts), then published.
//
// A draft can have co-editors. Everyone sees each other's changes live, and
// only one person at a time can have a prompt open — it's locked to them
// until they go back to the list. Each save writes only what that editor
// changed, on top of the latest version, so nobody's work is overwritten.
import {
    fetchGame, createDraft, saveDraftChanges, publishGame, deleteGame, getSession, canEdit,
    watchGame, claimPrompt, refreshPromptClaim, releasePrompt, lockIsLive, LOCK_REFRESH_MS,
    fetchProfiles, addEditor, removeEditor,
} from '../api.js';
import {
    parseGame, parseAnswerList, parseWholeGameReply, mergeAnswers, findClashes, publishProblems, cleanAnswer, SHORT_LIST,
} from '../gameFormat.js';
import { buildClaudePrompt, buildWholeGamePrompt } from '../claudePrompt.js';
import { TIERS, PROMPT_COUNT } from '../tiers.js';
import { THEMES, DEFAULT_THEME } from '../themes/index.js';
import { router } from '../router.js';
import { app, esc, showMessage } from '../utils/html.js';

const SAVE_DELAY_MS = 1500;
const CLASHES_SHOWN = 5;
// Tier sections longer than this start folded, so a 100-answer list stays scrollable.
const OPEN_SECTION_MAX = 12;

const emptyGame = () => ({
    title: '',
    theme: DEFAULT_THEME,
    prompts: Array.from({ length: PROMPT_COUNT }, () => ({ text: '', answers: [] })),
});

const cleanPrompts = prompts => prompts.map(p => ({ text: p.text || '', answers: (p.answers || []).map(cleanAnswer) }));

const tierOptions = selected => TIERS
    .map(t => `<option value="${t.tier}" ${t.tier === selected ? 'selected' : ''}>${t.name}</option>`)
    .join('');

const listNames = names => names.length <= 1 ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

class CreateComponent {
    constructor() {
        this.dirty = { title: false, theme: false, prompts: new Set() };
        // Best effort to free a prompt if the tab is closed while it's open.
        window.addEventListener('pagehide', () => this.releaseLock());
    }

    async render(gameId) {
        await this.leave();
        this.id = gameId || null;
        this.view = 'overview';
        this.statusText = '';
        this.dirty = { title: false, theme: false, prompts: new Set() };
        this.profiles = null;
        const me = getSession();

        if (!gameId) {
            this.game = emptyGame();
            this.meta = { createdBy: me.id, createdByName: me.username, editors: [], editorNames: {}, locks: {} };
            this.draw();
            return;
        }

        app().innerHTML = '<div class="loading">Loading draft…</div>';
        const game = await fetchGame(gameId);
        if (!game || !canEdit(game)) {
            showMessage('Draft not found', 'This draft doesn’t exist, or you haven’t been added to it.');
            return;
        }
        if (game.status !== 'draft') {
            showMessage('Already published', 'This game has been published, so it can’t be edited any more.');
            return;
        }
        this.game = { title: game.title || '', theme: game.theme || DEFAULT_THEME, prompts: cleanPrompts(game.prompts) };
        this.setMeta(game);
        this.startWatching();
        this.draw();
    }

    get isOwner() {
        return this.meta.createdBy === getSession().id;
    }

    setMeta(game) {
        this.meta = {
            createdBy: game.createdBy,
            createdByName: game.createdByName,
            editors: game.editors || [],
            editorNames: game.editorNames || {},
            locks: game.locks || {},
        };
    }

    // Someone else holding a prompt right now (null if free or mine).
    lockedBy(index) {
        const lock = this.meta.locks?.[index];
        return lockIsLive(lock) && lock.by !== getSession().id ? lock : null;
    }

    // ---- Live updates from other editors ----

    startWatching() {
        this.unwatch?.();
        this.unwatch = watchGame(this.id, remote => this.applyRemote(remote), err => console.error(err));
    }

    applyRemote(remote) {
        if (!remote) {
            if (this.deleting) return;
            this.dirty = { title: false, theme: false, prompts: new Set() };
            this.leave();
            showMessage('Draft deleted', `${this.meta.createdByName} has deleted this draft.`);
            return;
        }
        if (remote.status === 'published' && !this.publishing) {
            this.leave();
            showMessage('Published!', `“${remote.title}” has been published, so it can’t be edited any more.`);
            return;
        }
        this.setMeta(remote);
        // Take everyone else's work, but never overwrite something this
        // editor has changed and not saved yet, or the prompt they have open.
        const titleBox = document.getElementById('title');
        if (!this.dirty.title && document.activeElement !== titleBox) this.game.title = remote.title || '';
        if (!this.dirty.theme) this.game.theme = remote.theme || DEFAULT_THEME;
        const incoming = cleanPrompts(remote.prompts);
        this.game.prompts = this.game.prompts.map((p, i) =>
            (this.dirty.prompts.has(i) || this.myLock === i ? p : incoming[i]));
        if (this.view === 'overview') this.refreshOverview();
    }

    // ---- Saving: a short pause after each change, then one write ----

    // what: 'title' | 'theme' | 'all' | a prompt index
    changed(what) {
        if (what === 'title') this.dirty.title = true;
        else if (what === 'theme') this.dirty.theme = true;
        else if (what === 'all') {
            this.dirty.title = true;
            this.dirty.theme = true;
            this.game.prompts.forEach((_, i) => this.dirty.prompts.add(i));
        } else this.dirty.prompts.add(what);
        this.setStatus('Unsaved changes…');
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY_MS);
    }

    hasUnsaved() {
        return this.dirty.title || this.dirty.theme || this.dirty.prompts.size > 0;
    }

    // Called when leaving the page, so nothing typed in the last moment is lost.
    flush() {
        if (this.saveTimer) this.save();
    }

    // Saves now and resolves once everything is written. Saves run one after
    // another, each sending whatever is still unsaved when its turn comes.
    // force: create the draft even if nothing's changed (to share it).
    save(force = false) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.queue = (this.queue || Promise.resolve())
            .then(() => (force || this.hasUnsaved() ? this.doSave() : null));
        return this.queue;
    }

    async doSave() {
        if (!this.id) {
            this.setStatus('Saving…');
            const before = this.dirty;
            this.dirty = { title: false, theme: false, prompts: new Set() };
            try {
                this.id = await createDraft(structuredClone(this.game));
                // So a refresh reopens this draft rather than a blank one.
                const url = new URL(window.location);
                url.searchParams.set('id', this.id);
                history.replaceState({}, '', url);
                this.startWatching();
                this.setStatus('Draft saved');
            } catch (err) {
                console.error(err);
                this.dirty = before;
                this.setStatus('Couldn’t save — check your connection', true);
            }
            return;
        }
        if (!this.hasUnsaved()) return;
        const sent = { title: this.dirty.title, theme: this.dirty.theme, prompts: new Set(this.dirty.prompts) };
        const changes = {};
        if (sent.title) changes.title = this.game.title;
        if (sent.theme) changes.theme = this.game.theme;
        if (sent.prompts.size) {
            changes.prompts = {};
            sent.prompts.forEach(i => { changes.prompts[i] = structuredClone(this.game.prompts[i]); });
        }
        this.dirty = { title: false, theme: false, prompts: new Set() };
        this.setStatus('Saving…');
        try {
            await saveDraftChanges(this.id, changes);
            this.setStatus('Draft saved');
        } catch (err) {
            console.error(err);
            // Put the changes back so the next save tries again.
            this.dirty.title ||= sent.title;
            this.dirty.theme ||= sent.theme;
            sent.prompts.forEach(i => this.dirty.prompts.add(i));
            this.setStatus('Couldn’t save — check your connection', true);
        }
    }

    // Leaving the editor: save, free any prompt this editor had open, and stop
    // listening for changes.
    async leave() {
        await this.save();
        this.releaseLock();
        this.unwatch?.();
        this.unwatch = null;
    }

    setStatus(text, isError = false) {
        this.statusText = text;
        const el = document.getElementById('save-status');
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('error', isError);
    }

    // ---- Opening and closing a prompt (and its lock) ----

    async openPrompt(index) {
        if (this.id) {
            if (this.lockedBy(index)) {
                this.setStatus(`${this.lockedBy(index).name} is editing prompt ${index + 1} — try another one.`, true);
                return;
            }
            let result;
            try {
                result = await claimPrompt(this.id, index);
            } catch (err) {
                console.error(err);
                this.setStatus('Couldn’t open that prompt — check your connection.', true);
                return;
            }
            if (!result.ok) {
                this.setStatus(`${result.name} is editing prompt ${index + 1} — try another one.`, true);
                return;
            }
            this.myLock = index;
            this.lockTimer = setInterval(() => refreshPromptClaim(this.id, index).catch(() => {}), LOCK_REFRESH_MS);
        }
        this.view = index;
        this.draw();
        window.scrollTo(0, 0);
    }

    async closePrompt() {
        this.view = 'overview';
        this.draw();
        window.scrollTo(0, 0);
        if (this.saveTimer) await this.save();
        this.releaseLock();
    }

    releaseLock() {
        clearInterval(this.lockTimer);
        if (this.id && this.myLock !== undefined && this.myLock !== null) {
            releasePrompt(this.id, this.myLock).catch(() => {});
        }
        this.myLock = null;
    }

    draw() {
        if (this.view === 'overview') this.drawOverview();
        else this.drawPrompt(this.view);
    }

    // ---- Overview: title, theme, co-editors, the 7 prompts, publish ----

    drawOverview() {
        const { game } = this;
        const others = this.meta.editors.map(id => this.meta.editorNames[id] || id);
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

                <div class="card">
                    <p class="field-label">Theme</p>
                    <p class="hint theme-hint">What players see after each answer. Points are the same in every theme.</p>
                    <div class="theme-options" role="radiogroup" aria-label="Theme">
                        ${THEMES.map(t => `
                            <label class="theme-option theme-option-${t.id}">
                                <input type="radio" name="theme" value="${t.id}" ${game.theme === t.id ? 'checked' : ''}>
                                <span class="theme-option-name">${t.label}</span>
                                <span class="theme-option-blurb">${t.blurb}</span>
                                <span class="theme-option-tiers">${t.tierNames[0]} → ${t.tierNames[5]}</span>
                            </label>`).join('')}
                    </div>
                </div>

                <div class="card" id="editors-card">${this.editorsCard(others)}</div>

                <h2>Prompts</h2>
                <div id="slots">${game.prompts.map((p, i) => this.promptSlot(p, i)).join('')}</div>

                <div class="card claude-steps">
                    <h3>Fill every prompt with AI</h3>
                    <p class="hint">Write your questions first by tapping each prompt above. Answers already placed stay exactly where they are; the AI only adds new ones, which you can re-tier afterwards.</p>
                    <p class="step"><span class="step-num">1</span> Copy the request, then paste it into a new chat with an AI such as Claude.</p>
                    <div class="row">
                        <button class="btn btn-primary btn-small" id="copy-whole">Copy request for AI</button>
                        <a class="btn btn-secondary btn-small" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude ↗</a>
                    </div>
                    <p class="hint" id="whole-copy-status"></p>
                    <textarea id="whole-copy-fallback" rows="5" readonly hidden></textarea>
                    <p class="step"><span class="step-num">2</span> Paste the AI’s whole reply here. If it stopped part-way, ask it to “continue” and paste the next reply too.</p>
                    <textarea id="whole-reply" rows="4" spellcheck="false" placeholder="Paste the AI’s reply here"></textarea>
                    <button class="btn btn-primary" id="add-whole">Add these answers</button>
                    <p class="hint" id="whole-status" role="status"></p>
                </div>

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

                ${this.id && this.isOwner ? '<button class="btn btn-secondary" id="delete-draft">Delete this draft</button>' : ''}
                <button class="btn btn-secondary" id="back">← Home</button>
            </div>
        `;

        document.getElementById('title').addEventListener('input', e => {
            game.title = e.target.value;
            this.changed('title');
        });
        app().querySelectorAll('input[name="theme"]').forEach(radio => {
            radio.addEventListener('change', () => {
                game.theme = radio.value;
                this.changed('theme');
            });
        });
        this.bindSlots();
        this.bindEditors();
        document.getElementById('copy-whole').addEventListener('click', () => this.copyWholeRequest());
        document.getElementById('add-whole').addEventListener('click', () => this.addWholeReply());
        document.getElementById('publish').addEventListener('click', () => this.publish());
        document.getElementById('load-sample').addEventListener('click', async () => {
            const res = await fetch('sample-game.json');
            document.getElementById('game-json').value = await res.text();
        });
        document.getElementById('use-json').addEventListener('click', () => this.useJson());
        document.getElementById('delete-draft')?.addEventListener('click', () => this.deleteDraft());
        document.getElementById('back').addEventListener('click', () => router.navigate('home'));
    }

    // Updates the parts of the overview other editors can change, without
    // disturbing anything this person is typing.
    refreshOverview() {
        const slots = document.getElementById('slots');
        if (!slots) return;
        slots.innerHTML = this.game.prompts.map((p, i) => this.promptSlot(p, i)).join('');
        this.bindSlots();
        const titleBox = document.getElementById('title');
        if (titleBox && document.activeElement !== titleBox) titleBox.value = this.game.title;
        app().querySelectorAll('input[name="theme"]').forEach(r => { r.checked = r.value === this.game.theme; });
        // Don't redraw the co-editors card while someone's choosing from its list.
        if (document.activeElement?.id !== 'editor-pick') this.renderEditors();
    }

    renderEditors(message = '') {
        const card = document.getElementById('editors-card');
        if (!card) return;
        card.innerHTML = this.editorsCard(this.meta.editors.map(id => this.meta.editorNames[id] || id));
        this.bindEditors();
        if (message) document.getElementById('editor-status').textContent = message;
    }

    bindSlots() {
        app().querySelectorAll('[data-prompt]').forEach(btn => {
            btn.addEventListener('click', () => this.openPrompt(Number(btn.dataset.prompt)));
        });
    }

    promptSlot(p, i) {
        const count = p.answers.length;
        const lock = this.lockedBy(i);
        let state = 'empty';
        if (p.text.trim() && count >= SHORT_LIST) state = 'ready';
        else if (p.text.trim() || count) state = 'started';
        return `
            <button class="card prompt-slot slot-${state} ${lock ? 'slot-locked' : ''}" data-prompt="${i}">
                <span class="slot-num">${i + 1}</span>
                <span class="slot-body">
                    <span class="slot-text">${p.text.trim() ? esc(p.text) : '<em>Add a question</em>'}</span>
                    <span class="slot-meta">${lock ? `${esc(lock.name)} is editing this…`
                        : count ? `${count} answers${count < SHORT_LIST ? ' · could use more' : ''}` : 'No answers yet'}</span>
                </span>
                <span class="slot-arrow">${lock ? '✎' : '›'}</span>
            </button>
        `;
    }

    // ---- Co-editors ----

    editorsCard(others) {
        if (!this.isOwner) {
            const team = [this.meta.createdByName, ...others.filter(n => n !== getSession().username)];
            return `
                <p class="field-label">Co-editing</p>
                <p class="hint">You’re helping ${esc(this.meta.createdByName)} with this game${team.length > 1 ? `, along with ${esc(listNames(team.slice(1)))}` : ''}.
                Anyone on the team can edit and publish it.</p>`;
        }
        return `
            <p class="field-label">Co-editors</p>
            <p class="hint">People you add can edit and publish this draft with you. Once it’s published they’re treated like you: their own play is just for fun, and they can review answers.</p>
            ${others.length ? `<ul class="editor-list">
                ${this.meta.editors.map(id => `
                    <li><span>${esc(this.meta.editorNames[id] || id)}</span>
                        <button class="btn btn-secondary btn-small" data-remove-editor="${esc(id)}">Remove</button></li>`).join('')}
            </ul>` : ''}
            <div class="add-editor">
                <select id="editor-pick" aria-label="Player to add"><option value="">Add a co-editor…</option></select>
                <button class="btn btn-secondary btn-small" id="add-editor">Add</button>
            </div>
            <p class="hint" id="editor-status" role="status"></p>`;
    }

    async bindEditors() {
        if (!this.isOwner) return;
        app().querySelectorAll('[data-remove-editor]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.removeEditor;
                btn.disabled = true;
                try {
                    await removeEditor(this.id, id);
                    const name = this.meta.editorNames[id] || id;
                    this.meta.editors = this.meta.editors.filter(e => e !== id);
                    delete this.meta.editorNames[id];
                    this.renderEditors(`${name} can no longer edit this draft.`);
                } catch (err) {
                    console.error(err);
                    document.getElementById('editor-status').textContent = 'Couldn’t remove them — check your connection.';
                    btn.disabled = false;
                }
            });
        });
        document.getElementById('add-editor').addEventListener('click', () => this.addCoEditor());

        // Fill the picker with every other player.
        try {
            this.profiles ||= await fetchProfiles();
        } catch (err) {
            console.error(err);
            return;
        }
        const pick = document.getElementById('editor-pick');
        if (!pick) return;
        const taken = new Set([this.meta.createdBy, ...this.meta.editors]);
        pick.insertAdjacentHTML('beforeend', this.profiles
            .filter(p => !taken.has(p.id))
            .map(p => `<option value="${esc(p.id)}">${esc(p.username)}</option>`).join(''));
    }

    async addCoEditor() {
        const pick = document.getElementById('editor-pick');
        const status = document.getElementById('editor-status');
        const profile = this.profiles?.find(p => p.id === pick.value);
        if (!profile) {
            status.textContent = 'Choose a player first.';
            return;
        }
        try {
            if (!this.id) await this.save(true);  // a draft needs to exist to be shared
            await addEditor(this.id, profile);
            this.meta.editors = [...new Set([...this.meta.editors, profile.id])];
            this.meta.editorNames = { ...this.meta.editorNames, [profile.id]: profile.username };
            this.renderEditors(`${profile.username} can now edit this draft. It’ll appear on their home screen.`);
        } catch (err) {
            console.error(err);
            status.textContent = 'Couldn’t add them — check your connection.';
        }
    }

    // ---- Whole-game AI fill ----

    async copyWholeRequest() {
        const status = document.getElementById('whole-copy-status');
        if (!this.game.prompts.some(p => p.text.trim())) {
            status.textContent = 'Write at least one question first — tap a prompt above.';
            return;
        }
        const text = buildWholeGamePrompt(this.game);
        const written = this.game.prompts.filter(p => p.text.trim()).length;
        try {
            await navigator.clipboard.writeText(text);
            status.textContent = `Copied a request for ${written} question${written === 1 ? '' : 's'}. Now paste it into the AI.`;
        } catch {
            const fallback = document.getElementById('whole-copy-fallback');
            fallback.value = text;
            fallback.hidden = false;
            fallback.select();
            status.textContent = 'Couldn’t copy automatically — select all the text below and copy it.';
        }
    }

    // Adds the AI's answers to each prompt. Anything already on a list —
    // including every answer someone placed themselves — is left alone, so
    // their tiers always win. Prompts a co-editor has open are skipped.
    addWholeReply() {
        const status = document.getElementById('whole-status');
        let parsed;
        try {
            parsed = parseWholeGameReply(document.getElementById('whole-reply').value);
        } catch (err) {
            status.textContent = err.message;
            return;
        }
        let added = 0;
        let dupes = 0;
        const touched = [];
        const noQuestion = [];
        const busy = [];
        for (const [index, answers] of parsed.answersByPrompt) {
            const prompt = this.game.prompts[index];
            if (!prompt.text.trim()) {
                noQuestion.push(index + 1);
                continue;
            }
            const lock = this.lockedBy(index);
            if (lock) {
                busy.push(`${index + 1} (${lock.name})`);
                continue;
            }
            const n = mergeAnswers(prompt.answers, answers);
            added += n;
            dupes += answers.length - n;
            if (n) {
                touched.push(index + 1);
                this.changed(index);
            }
        }
        this.draw();

        const notes = [];
        notes.push(`Added ${added} answer${added === 1 ? '' : 's'}${touched.length ? ` to question${touched.length === 1 ? '' : 's'} ${touched.join(', ')}` : ''}.`);
        if (dupes) notes.push(`${dupes} ${dupes === 1 ? 'was' : 'were'} already on the list and left as they are.`);
        if (parsed.skipped) notes.push(`${parsed.skipped} incomplete entr${parsed.skipped === 1 ? 'y was' : 'ies were'} skipped.`);
        if (noQuestion.length) notes.push(`Ignored answers for question${noQuestion.length === 1 ? '' : 's'} ${noQuestion.join(', ')}, which ${noQuestion.length === 1 ? 'has' : 'have'} no question written yet.`);
        if (busy.length) notes.push(`Skipped question${busy.length === 1 ? '' : 's'} ${busy.join(', ')} because ${busy.length === 1 ? 'someone is' : 'people are'} editing — paste the same reply again once they’ve finished.`);
        if (parsed.cutOff.length) notes.push(`Question${parsed.cutOff.length === 1 ? '' : 's'} ${parsed.cutOff.join(', ')} got cut off — ask the AI to “continue” and paste its next reply here too.`);
        document.getElementById('whole-status').textContent = notes.join(' ');
    }

    busyPrompts() {
        return this.game.prompts.map((_, i) => this.lockedBy(i)).map((lock, i) => lock && { i, name: lock.name }).filter(Boolean);
    }

    useJson() {
        const errorEl = document.getElementById('json-error');
        const busy = this.busyPrompts();
        if (busy.length) {
            errorEl.textContent = `${busy[0].name} is editing prompt ${busy[0].i + 1} — wait until nobody else has a prompt open before replacing the whole game.`;
            return;
        }
        let parsed;
        try {
            parsed = parseGame(document.getElementById('game-json').value);
        } catch (err) {
            errorEl.textContent = err.message;
            return;
        }
        const hasWork = this.game.title.trim() || this.game.prompts.some(p => p.text.trim() || p.answers.length);
        if (hasWork && !confirm('Replace everything in this draft with the pasted game?')) return;
        this.game = { ...parsed, theme: parsed.theme || this.game.theme };
        this.changed('all');
        this.draw();
    }

    async publish() {
        const box = document.getElementById('publish-problems');
        const busy = this.busyPrompts();
        if (busy.length) {
            box.innerHTML = `<div class="card warn"><p>${esc(busy[0].name)} is still editing prompt ${busy[0].i + 1}. Publish once they’ve gone back to the list.</p></div>`;
            return;
        }
        const problems = publishProblems(this.game);
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
            if (this.game.title !== this.game.title.trim()) {
                this.game.title = this.game.title.trim();
                this.changed('title');
            }
            await this.save();
            if (this.hasUnsaved()) throw new Error('save failed');
            this.publishing = true;
            await publishGame(this.id);
            await this.leave();
            this.publishing = false;
            router.navigate('home');
        } catch (err) {
            console.error(err);
            this.publishing = false;
            box.innerHTML = '<p class="error">Couldn’t publish — check your connection and try again.</p>';
            button.disabled = false;
            button.textContent = 'Publish';
        }
    }

    async deleteDraft() {
        if (!confirm('Delete this draft? This can’t be undone.')) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.dirty = { title: false, theme: false, prompts: new Set() };
        this.deleting = true;
        try {
            await deleteGame(this.id);
            this.unwatch?.();
            this.unwatch = null;
            this.deleting = false;
            router.navigate('home');
        } catch (err) {
            console.error(err);
            this.deleting = false;
            this.setStatus('Couldn’t delete — check your connection', true);
        }
    }

    // ---- One prompt: its question, Claude fill-out, and the answer list ----

    drawPrompt(index) {
        const prompt = this.game.prompts[index];
        const { answers } = prompt;
        const clashes = findClashes(answers);
        const shared = this.meta.editors.length > 0;

        app().innerHTML = `
            <div class="container">
                <div class="editor-top">
                    <button class="btn btn-secondary btn-small" id="to-overview">← All prompts</button>
                    <span class="save-status" id="save-status">${esc(this.statusText)}</span>
                </div>
                <h1 class="editor-title">Prompt ${index + 1} of ${PROMPT_COUNT}</h1>
                ${shared ? '<p class="hint">You have this prompt open, so your co-editors can’t change it until you go back to the list.</p>' : ''}

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
        const changed = () => this.changed(index);
        // Re-drawing after a tier change or delete shouldn't jump back to the top.
        const redraw = () => {
            const y = window.scrollY;
            this.drawPrompt(index);
            window.scrollTo(0, y);
        };
        document.getElementById('to-overview').addEventListener('click', () => this.closePrompt());
        document.getElementById('to-overview-bottom').addEventListener('click', () => this.closePrompt());

        document.getElementById('prompt-text').addEventListener('input', e => {
            prompt.text = e.target.value;
            changed();
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
            changed();
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
            changed();
            redraw();
            document.getElementById('new-name').focus();
        });

        app().querySelectorAll('.ans-row').forEach(row => {
            const answer = answers[Number(row.dataset.index)];
            row.querySelector('.ans-name').addEventListener('input', e => {
                answer.name = e.target.value;
                changed();
            });
            // Blank names are tidied away when you leave the box, not mid-typing.
            row.querySelector('.ans-name').addEventListener('change', e => {
                if (e.target.value.trim()) return;
                answers.splice(answers.indexOf(answer), 1);
                changed();
                redraw();
            });
            row.querySelector('.ans-aliases').addEventListener('input', e => {
                answer.aliases = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                changed();
            });
            row.querySelector('.ans-tier').addEventListener('change', e => {
                answer.tier = Number(e.target.value);
                changed();
                redraw();
            });
            row.querySelector('.ans-del').addEventListener('click', () => {
                answers.splice(answers.indexOf(answer), 1);
                changed();
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
