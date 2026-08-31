// Lets anyone browse any registered player's stats from the archive,
// without needing to be "logged in" as that player on this device.
import { db } from '../firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { router } from '../router.js';

class PlayerStatsPickerComponent {
    constructor() {
        this.players = [];
        this.loading = true;
    }

    async loadPlayers() {
        this.loading = true;
        try {
            const usersRef = collection(db, "LizzieUsers");
            const snapshot = await getDocs(usersRef);
            this.players = [];
            snapshot.forEach(doc => {
                this.players.push({ id: doc.id, name: doc.data().name });
            });
            this.players.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Error loading players:', error);
        }
        this.loading = false;
    }

    async render() {
        await this.loadPlayers();

        const app = document.getElementById('app');

        if (this.loading) {
            app.innerHTML = `
                <div class="container">
                    <div style="text-align: center; padding: 3rem;">
                        <p style="font-size: 1.25rem; color: #6b7280;">Loading players...</p>
                    </div>
                </div>
            `;
            return;
        }

        if (this.players.length === 0) {
            app.innerHTML = `
                <div class="container">
                    <header>
                        <h1>📊 Player Stats</h1>
                        <p class="subtitle">No players yet!</p>
                        <button class="nav-link" id="back-btn" style="margin-top: 1rem;">← Back</button>
                    </header>
                </div>
            `;
            document.getElementById('back-btn').onclick = () => history.back();
            return;
        }

        app.innerHTML = `
            <div class="container" style="padding: 1rem;">
                <header>
                    <h1>📊 Player Stats</h1>
                    <p class="subtitle">Choose a player to view their stats</p>
                    <button class="nav-link" id="back-btn" style="margin-top: 0.5rem;">← Back</button>
                </header>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
                    ${this.players.map((p, idx) => `
                        <button class="btn btn-secondary player-pick-btn" data-idx="${idx}" style="padding: 1.5rem 1rem; font-size: 1.125rem;">
                            👤 ${p.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        document.getElementById('back-btn').onclick = () => history.back();
        document.querySelectorAll('.player-pick-btn').forEach(btn => {
            btn.onclick = () => {
                const player = this.players[Number(btn.dataset.idx)];
                router.navigate('player-stats', { player: player.id, name: player.name });
            };
        });
    }
}

export const playerStatsPickerComponent = new PlayerStatsPickerComponent();
