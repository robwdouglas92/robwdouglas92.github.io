import { fetchGames, fetchMyPlays, getSession, signOut } from '../api.js';
import { router } from '../router.js';
import { app, esc } from '../utils/html.js';

class HomeComponent {
    async render() {
        const me = getSession();
        app().innerHTML = '<div class="loading">Loading games…</div>';

        let games;
        let plays;
        try {
            [games, plays] = await Promise.all([fetchGames(), fetchMyPlays()]);
        } catch (err) {
            console.error(err);
            app().innerHTML = '<div class="container"><div class="card"><p class="error">Couldn’t load games. Check your connection and refresh.</p></div></div>';
            return;
        }
        const playByGame = Object.fromEntries(plays.map(p => [p.gameId, p]));

        app().innerHTML = `
            <div class="container">
                <header>
                    <h1 class="logo">Rizzie</h1>
                    <p class="subtitle">Hi ${esc(me.username)}! The rarest answer wins.</p>
                </header>

                ${me.isCreator || me.isAdmin ? `
                    <div class="row">
                        <button class="btn btn-primary" id="create-game">+ Create a game</button>
                    </div>
                ` : ''}
                ${me.isAdmin ? '<button class="btn btn-secondary" id="admin">Admin: players & PINs</button>' : ''}

                <h2>Games</h2>
                ${games.length ? games.map(g => this.gameCard(g, playByGame[g.id], me)).join('') : `
                    <div class="card"><p>No games yet. ${me.isCreator ? 'Create the first one!' : 'Check back soon.'}</p></div>
                `}

                <footer class="footer">
                    Signed in as ${esc(me.username)} · <button class="link" id="sign-out">Sign out</button>
                </footer>
            </div>
        `;

        app().querySelectorAll('[data-play]').forEach(btn => {
            btn.addEventListener('click', () => router.navigate('play', { id: btn.dataset.play }));
        });
        app().querySelectorAll('[data-results]').forEach(btn => {
            btn.addEventListener('click', () => router.navigate('results', { id: btn.dataset.results }));
        });
        document.getElementById('create-game')?.addEventListener('click', () => router.navigate('create'));
        document.getElementById('admin')?.addEventListener('click', () => router.navigate('admin'));
        document.getElementById('sign-out').addEventListener('click', async () => {
            await signOut();
            router.navigate('home');
        });
    }

    gameCard(game, play, me) {
        const mine = game.createdBy === me.id;
        let action;
        if (play?.status === 'complete') {
            action = `<span class="score-pill">${play.total} pts</span>
                <button class="btn btn-secondary btn-small" data-results="${game.id}">Answers</button>`;
        } else if (play) {
            action = `<button class="btn btn-primary btn-small" data-play="${game.id}">Carry on</button>`;
        } else if (mine) {
            // Creators have seen every answer, so their own play is just for fun
            // and stays off the leaderboard.
            action = `<button class="btn btn-secondary btn-small" data-play="${game.id}">Play for fun</button>
                <button class="btn btn-secondary btn-small" data-results="${game.id}">Answers</button>`;
        } else {
            action = `<button class="btn btn-primary btn-small" data-play="${game.id}">Play</button>`;
        }
        return `
            <div class="card game-card">
                <div>
                    <div class="game-title">${esc(game.title)}</div>
                    <div class="game-meta">${mine ? 'Your game' : `By ${esc(game.createdByName)}`}</div>
                </div>
                <div class="game-actions">${action}</div>
            </div>
        `;
    }
}

export const homeComponent = new HomeComponent();
