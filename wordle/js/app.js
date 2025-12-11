import { router } from './router.js';
import { db, auth } from './firebase.js';
import { gameComponent } from './components/game.js';
import { userSelectComponent } from './components/userSelect.js';
import { adminComponent } from './components/admin.js';
import { getCurrentUserId } from './utils/helpers.js';

// Register routes
router.register('game', async (params) => {
    const gameId = params.get('id');
    const userId = getCurrentUserId();
    
    if (!gameId) {
        document.getElementById('app').innerHTML = `
            <div class="container">
                <header>
                    <h1>Family Wordle</h1>
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
                    <h1>Family Wordle</h1>
                    <p class="subtitle" style="color: #ef4444;">Game not found</p>
                    <button class="nav-link" onclick="history.back()" style="margin-top: 1rem;">← Go Back</button>
                </header>
            </div>
        `;
    }
});

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
    
    // Placeholder for stats component (Phase 3)
    document.getElementById('app').innerHTML = `
        <div class="container">
            <header>
                <h1>📊 My Stats</h1>
                <p class="subtitle">Stats coming in Phase 3!</p>
                <button class="nav-link" id="back-btn" style="margin-top: 1rem;">← Back to Game</button>
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

router.register('leaderboard', async (params) => {
    const gameId = params.get('id');
    
    // Placeholder for leaderboard component (Phase 3)
    document.getElementById('app').innerHTML = `
        <div class="container">
            <header>
                <h1>🏆 Leaderboard</h1>
                <p class="subtitle">Leaderboard coming in Phase 3!</p>
                <button class="nav-link" id="back-btn" style="margin-top: 1rem;">← Back to Game</button>
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

// Admin route - NOW USING THE COMPONENT
router.register('admin', async (params) => {
    await adminComponent.checkAuth();
    adminComponent.render();
});

// Start the app
console.log('Starting Wordle app...');
router.start();
