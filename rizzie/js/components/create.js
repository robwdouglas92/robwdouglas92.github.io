// Creating a game by pasting its JSON. This is the bare-bones version: the
// editor and the copy-a-prompt-for-Claude flow will build on the same
// parseGame() check later.
import { createGame } from '../api.js';
import { parseGame } from '../gameFormat.js';
import { TIERS } from '../tiers.js';
import { router } from '../router.js';
import { app, esc } from '../utils/html.js';

class CreateComponent {
    render() {
        this.parsed = null;
        app().innerHTML = `
            <div class="container">
                <header>
                    <h1>Create a game</h1>
                    <p class="subtitle">Paste a game in JSON format</p>
                </header>
                <div class="card">
                    <textarea id="game-json" rows="10" spellcheck="false" placeholder='{ "title": "…", "prompts": [ … ] }'></textarea>
                    <div class="row">
                        <button class="btn btn-secondary btn-small" id="load-sample">Load the sample Christmas game</button>
                    </div>
                    <p class="error" id="create-error" role="alert"></p>
                    <div id="preview"></div>
                </div>
                <button class="btn btn-primary btn-big" id="publish" disabled>Publish</button>
                <button class="btn btn-secondary" id="back">← Home</button>
            </div>
        `;

        const textarea = document.getElementById('game-json');
        textarea.addEventListener('input', () => this.check(textarea.value));
        document.getElementById('load-sample').addEventListener('click', async () => {
            const res = await fetch('sample-game.json');
            textarea.value = await res.text();
            this.check(textarea.value);
        });
        document.getElementById('publish').addEventListener('click', () => this.publish());
        document.getElementById('back').addEventListener('click', () => router.navigate('home'));
    }

    check(text) {
        const errorEl = document.getElementById('create-error');
        const preview = document.getElementById('preview');
        const publish = document.getElementById('publish');
        this.parsed = null;
        publish.disabled = true;
        preview.innerHTML = '';
        errorEl.textContent = '';
        if (!text.trim()) return;

        try {
            this.parsed = parseGame(text);
        } catch (err) {
            errorEl.textContent = err.message;
            return;
        }
        publish.disabled = false;
        preview.innerHTML = `
            <p class="game-title">${esc(this.parsed.title)}</p>
            <ol class="preview-list">
                ${this.parsed.prompts.map(p => `
                    <li>${esc(p.text)}
                        <span class="hint">${p.answers.length} answers ·
                        ${TIERS.map(t => `${p.answers.filter(a => a.tier === t.tier).length} ${t.name.toLowerCase()}`).join(', ')}</span>
                    </li>`).join('')}
            </ol>
        `;
    }

    async publish() {
        const button = document.getElementById('publish');
        button.disabled = true;
        button.textContent = 'Publishing…';
        try {
            await createGame(this.parsed);
            router.navigate('home');
        } catch (err) {
            console.error(err);
            document.getElementById('create-error').textContent = 'Couldn’t publish — are you marked as a creator?';
            button.disabled = false;
            button.textContent = 'Publish';
        }
    }
}

export const createComponent = new CreateComponent();
