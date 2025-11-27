import { router } from './router.js';
import { db, auth } from './firebase.js';

// Test route handler
router.register('game', (params) => {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container">
            <header>
                <h1>Family Connections</h1>
                <p class="subtitle">Router is working! 🎉</p>
                <p style="margin-top: 1rem;">Firebase: ${db ? '✅' : '❌'}</p>
                <p>Auth: ${auth ? '✅' : '❌'}</p>
            </header>
        </div>
    `;
});

// Start the app
console.log('Starting app...');
router.start();
