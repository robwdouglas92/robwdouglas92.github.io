import { signIn, signUp, reclaimProfile, usernameError, pinError } from '../api.js';
import { app } from '../utils/html.js';

const pinInput = (id, autocomplete) =>
    `<input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="${autocomplete}" required>`;

const BUTTON_TEXT = {
    signin: ['Sign in', 'Signing in…'],
    signup: ['Create player', 'Creating…'],
    reclaim: ['Set new PIN', 'Saving…'],
};

class AuthComponent {
    constructor() {
        this.mode = 'signin';   // 'signin' | 'signup' | 'reclaim'
    }

    // onDone runs once signed in, so whatever page the player was heading to
    // (e.g. a shared game link) carries on from there.
    render(onDone) {
        this.onDone = onDone;
        const { mode } = this;
        const tabs = mode === 'reclaim' ? '' : `
            <div class="tabs">
                <button class="tab ${mode === 'signin' ? 'active' : ''}" data-mode="signin">Sign in</button>
                <button class="tab ${mode === 'signup' ? 'active' : ''}" data-mode="signup">New player</button>
            </div>`;

        let fields;
        if (mode === 'signup') {
            fields = `
                <label for="pin">Choose a 6-digit PIN</label>${pinInput('pin', 'new-password')}
                <label for="pin2">Type your PIN again</label>${pinInput('pin2', 'new-password')}
                <p class="hint">You'll stay signed in on this phone, so you should only need your PIN on a new device.</p>`;
        } else if (mode === 'reclaim') {
            fields = `
                <label for="code">Reset code from your admin</label>${pinInput('code', 'one-time-code')}
                <label for="pin">Choose a new 6-digit PIN</label>${pinInput('pin', 'new-password')}
                <label for="pin2">Type your new PIN again</label>${pinInput('pin2', 'new-password')}`;
        } else {
            fields = `<label for="pin">PIN</label>${pinInput('pin', 'current-password')}`;
        }

        app().innerHTML = `
            <div class="container">
                <header>
                    <h1 class="logo">Rizzie</h1>
                    <p class="subtitle">${mode === 'reclaim' ? 'Reset your PIN' : 'The rarest answer wins'}</p>
                </header>
                <div class="card">
                    ${tabs}
                    <form id="auth-form" novalidate>
                        <label for="username">Username</label>
                        <input id="username" autocomplete="username" autocapitalize="words" spellcheck="false" maxlength="20" required>
                        ${fields}
                        <p class="error" id="auth-error" role="alert"></p>
                        <button class="btn btn-primary" type="submit" id="auth-submit">${BUTTON_TEXT[mode][0]}</button>
                    </form>
                    ${mode === 'signin' ? `
                        <p class="hint">Forgotten your PIN? Ask a Rizzie admin for a reset code, then tap
                        <button class="link" data-mode="reclaim">I’ve had my PIN reset</button>.</p>` : ''}
                    ${mode === 'reclaim' ? '<p class="hint"><button class="link" data-mode="signin">← Back to sign in</button></p>' : ''}
                </div>
            </div>
        `;

        app().querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.mode = btn.dataset.mode;
                this.render(onDone);
            });
        });
        document.getElementById('auth-form').addEventListener('submit', e => {
            e.preventDefault();
            this.submit();
        });
    }

    async submit() {
        const { mode } = this;
        const value = id => document.getElementById(id)?.value ?? '';
        const username = value('username');
        const pin = value('pin');
        const errorEl = document.getElementById('auth-error');
        const button = document.getElementById('auth-submit');

        const problem = usernameError(username)
            || (mode === 'reclaim' && !/^\d{6}$/.test(value('code')) ? 'The reset code is 6 digits.' : null)
            || pinError(pin)
            || (mode !== 'signin' && value('pin2') !== pin ? 'Those PINs don’t match.' : null);
        if (problem) {
            errorEl.textContent = problem;
            return;
        }

        errorEl.textContent = '';
        button.disabled = true;
        button.textContent = BUTTON_TEXT[mode][1];
        try {
            if (mode === 'signup') await signUp(username, pin);
            else if (mode === 'reclaim') await reclaimProfile(username, value('code'), pin);
            else await signIn(username, pin);
            this.mode = 'signin';
            this.onDone();
        } catch (err) {
            errorEl.textContent = err.message;
            button.disabled = false;
            button.textContent = BUTTON_TEXT[mode][0];
        }
    }
}

export const authComponent = new AuthComponent();
