import { router } from './router.js';
import { configured } from './firebase.js';
import { loadSession, getSession } from './api.js';
import { authComponent } from './components/auth.js';
import { homeComponent } from './components/home.js';
import { playComponent } from './components/play.js';
import { resultsComponent } from './components/results.js';
import { createComponent } from './components/create.js';
import { adminComponent } from './components/admin.js';
import { app, showMessage } from './utils/html.js';

// Every page needs a signed-in player. Signing in re-runs the same route, so a
// shared game link still lands on that game afterwards.
function page(handler) {
    return async params => {
        playComponent.stop();
        if (!getSession()) {
            authComponent.render(() => router.handleRoute());
            return;
        }
        try {
            await handler(params, getSession());
        } catch (err) {
            console.error(err);
            showMessage('Something went wrong', 'Check your connection and try again.');
        }
    };
}

router.register('home', page(() => homeComponent.render()));

router.register('play', page(async params => {
    const id = params.get('id');
    if (!id) return router.navigate('home');
    app().innerHTML = '<div class="loading">Loading game…</div>';
    await playComponent.load(id);
    playComponent.render();
}));

router.register('results', page(params => resultsComponent.render(params.get('id'))));

router.register('create', page((params, me) => {
    if (!me.isCreator && !me.isAdmin) return router.navigate('home');
    createComponent.render();
}));

router.register('admin', page((params, me) => {
    if (!me.isAdmin) return router.navigate('home');
    return adminComponent.render();
}));

if (configured) {
    try {
        await loadSession();
        router.start();
    } catch (err) {
        console.error(err);
        showMessage('Couldn’t connect', 'Check your internet connection and refresh.', { back: false });
    }
} else {
    showMessage('Rizzie isn’t set up yet', 'Paste your Firebase web config into rizzie/js/firebase-config.js.', { back: false });
}
