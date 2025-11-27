import { router } from './router.js';
import { db, auth } from './firebase.js';
import { gameComponent } from './components/game.js';
import { getCurrentUserId } from './utils/helpers.js';

// Register routes
router.register('game', async (params) => {
    const gameId = params.get('id');
    const userId = getCurrentUserId();
    
    if (!gameId) {
        document.getElementById('app').innerHTML = `
            <div class="container">
                <header>
                    <h1>Family Connections</h1>
                    <p class="subtitle">No game ID provided</p>
                    <p style="margin-top: 1rem; color: #6b7280;">Please use a valid game link or create a game in admin mode.</p>
                </header>
            </div>
        `;
        return;
    }

    if (!userId) {
        // TODO: Show name selection modal
        document.getElementById('app').innerHTML = `
            <div class="container">
                <header>
                    <h1>Family Connections</h1>
                    <p class="subtitle">Please select your player profile</p>
                    <p style="margin-top: 1rem; color: #6b7280;">Name selection coming in next step...</p>
                </header>
            </div>
        `;
        return;
    }

    const success = await gameComponent.load(gameId);
    if (success) {
        gameComponent.render();
    } else {
        document.getElementById('app').innerHTML = `
            <div class="container">
                <header>
                    <h1>Family Connections</h1>
                    <p class="subtitle" style="color: #ef4444;">Game not found</p>
                </header>
            </div>
        `;
    }
});

// Placeholder routes
router.register('stats', (params) => {
    document.getElementById('app').innerHTML = `
        <div class="container">
            <header>
                <h1>📊 My Stats</h1>
                <p class="subtitle">Coming soon...</p>
                <button class="nav-link" onclick="history.back()">← Back to Game</button>
            </header>
        </div>
    `;
});

router.register('leaderboard', (params) => {
    document.getElementById('app').innerHTML = `
        <div class="container">
            <header>
                <h1>🏆 Leaderboard</h1>
                <p class="subtitle">Coming soon...</p>
                <button class="nav-link" onclick="history.back()">← Back to Game</button>
            </header>
        </div>
    `;
});

// Start the app
console.log('Starting app...');
router.start();
