import { fetchProfiles, fetchResets, setRoles, issueReset, cancelReset, getSession } from '../api.js';
import { router } from '../router.js';
import { app, esc } from '../utils/html.js';

function expiresIn(reset) {
    const hours = (reset.expiresAt.toMillis() - Date.now()) / 3600000;
    if (hours <= 0) return 'expired';
    return hours >= 1 ? `expires in ${Math.floor(hours)}h` : `expires in ${Math.ceil(hours * 60)} min`;
}

class AdminComponent {
    async render() {
        app().innerHTML = '<div class="loading">Loading players…</div>';
        [this.profiles, this.resets] = await Promise.all([fetchProfiles(), fetchResets()]);
        this.draw();
    }

    draw() {
        const me = getSession();
        app().innerHTML = `
            <div class="container">
                <header>
                    <h1>Admin</h1>
                    <p class="subtitle">${this.profiles.length} players</p>
                </header>
                <p class="error" id="admin-error" role="alert"></p>
                ${this.profiles.map(p => this.playerCard(p, me)).join('')}
                <p class="hint">Creators can make games. Admins can do everything here, and can always make games too.</p>
                <button class="btn btn-secondary" id="back">← Home</button>
            </div>
        `;

        app().querySelectorAll('[data-role]').forEach(box => {
            box.addEventListener('change', () => this.toggleRole(box));
        });
        app().querySelectorAll('[data-reset]').forEach(btn => {
            btn.addEventListener('click', () => this.reset(btn.dataset.reset));
        });
        app().querySelectorAll('[data-cancel]').forEach(btn => {
            btn.addEventListener('click', () => this.cancel(btn.dataset.cancel));
        });
        document.getElementById('back').addEventListener('click', () => router.navigate('home'));
    }

    playerCard(p, me) {
        const isMe = p.id === me.id;
        const reset = this.resets[p.id];
        return `
            <div class="card admin-card">
                <div class="admin-name">${esc(p.username)}${isMe ? ' <span class="hint">(you)</span>' : ''}</div>
                <div class="admin-roles">
                    <label class="switch"><input type="checkbox" data-role="isCreator" data-id="${esc(p.id)}"
                        ${p.isCreator ? 'checked' : ''}> Creator</label>
                    <!-- You can't remove your own admin, so there's always at least one. -->
                    <label class="switch"><input type="checkbox" data-role="isAdmin" data-id="${esc(p.id)}"
                        ${p.isAdmin ? 'checked' : ''} ${isMe ? 'disabled' : ''}> Admin</label>
                </div>
                ${reset ? `
                    <div class="reset-code">
                        <div>Reset code for ${esc(p.username)}: <strong class="code">${esc(reset.code)}</strong>
                            <span class="hint">(${expiresIn(reset)})</span></div>
                        <p class="hint">Give them this code. On the sign-in screen they tap “I’ve had my PIN reset”, enter it, and choose a new PIN.</p>
                        <button class="btn btn-secondary btn-small" data-cancel="${esc(p.id)}">Cancel reset</button>
                    </div>
                ` : isMe ? '' : `<button class="btn btn-secondary btn-small" data-reset="${esc(p.id)}">Reset PIN</button>`}
            </div>
        `;
    }

    async toggleRole(box) {
        const profile = this.profiles.find(p => p.id === box.dataset.id);
        const role = box.dataset.role;
        box.disabled = true;
        try {
            await setRoles(profile.id, { [role]: box.checked });
            profile[role] = box.checked;
        } catch (err) {
            console.error(err);
            box.checked = !box.checked;
            document.getElementById('admin-error').textContent = 'Couldn’t save that change. Check your connection.';
        }
        box.disabled = false;
    }

    async reset(id) {
        const profile = this.profiles.find(p => p.id === id);
        if (!confirm(`Reset ${profile.username}'s PIN? Their current PIN keeps working until they use the code.`)) return;
        try {
            this.resets[id] = await issueReset(id);
            this.draw();
        } catch (err) {
            console.error(err);
            document.getElementById('admin-error').textContent = 'Couldn’t create a reset code. Check your connection.';
        }
    }

    async cancel(id) {
        try {
            await cancelReset(id);
            delete this.resets[id];
            this.draw();
        } catch (err) {
            console.error(err);
            document.getElementById('admin-error').textContent = 'Couldn’t cancel the reset. Check your connection.';
        }
    }
}

export const adminComponent = new AdminComponent();
