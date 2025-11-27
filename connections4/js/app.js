import { router } from './router.js';
import { db, auth } from './firebase.js';
import { gameComponent } from './components/game.js';
import { userSelectComponent } from './components/userSelect.js';
import { statsComponent } from './components/stats.js';
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
                    <p style="margin-top: 1rem; color: #6b7280;">Please use a valid game link.</p>
                    <button class="nav-link" id="go-admin" style="margin-top: 1rem;">Go to Admin Mode</button>
                </header>
            </div>
        `;
        
        document.getElementById('go-admin').onclick = () => {
            router.navigate('admin');
        };
        return;
    }

    if (!userId) {
        await userSelectComponent.render();
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
                    <button class="nav-link" onclick="history.back()" style="margin-top: 1rem;">← Go Back</button>
                </header>
            </div>
        `;
    }
});

// Stats route - NOW USING THE COMPONENT
router.register('stats', async (params) => {
    const gameId = params.get('id');
    const userId = getCurrentUserId();
    
    if (!userId) {
        document.getElementById('app').innerHTML = `
            <div class="container">
                <header>
                    <h1>📊 My Stats</h1>
                    <p class="subtitle" style="color: #ef4444;">Please select a player first</p>
                    <button class="nav-link" id="back-btn" style="margin-top: 1rem;">← Go Back</button>
                </header>
            </div>
        `;
        
        document.getElementById('back-btn').onclick = () => history.back();
        return;
    }
    
    await statsComponent.load();
    statsComponent.render(gameId);
});

router.register('leaderboard', (params) => {
    const gameId = params.get('id');
    document.getElementById('app').innerHTML = `
        <div class="container">
            <header>
                <h1>🏆 Leaderboard</h1>
                <p class="subtitle">Coming next...</p>
                <button class="nav-link" id="back-btn">← Back to Game</button>
            </header>
        </div>
    `;
    
    document.getElementById('back-btn').onclick = () => {
        if (gameId) {
            router.navigate('game', { id: gameId });
        } else {
            history.back();
        }
    };
});

router.register('admin', (params) => {
    document.getElementById('app').innerHTML = `
        <div class="container">
            <header>
                <h1>🎮 Admin Mode</h1>
                <p class="subtitle">Coming soon...</p>
                <p style="margin-top: 1rem; color: #6b7280;">Admin panel will be built in the next step!</p>
            </header>
        </div>
    `;
});

// Start the app
console.log('Starting app...');
router.start();
