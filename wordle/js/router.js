class Router {
    constructor() {
        this.routes = {};
        this.currentView = null;
        
        // Listen for URL changes
        window.addEventListener('popstate', () => this.handleRoute());
    }

    register(path, handler) {
        this.routes[path] = handler;
    }

    navigate(path, params = {}) {
        const url = new URL(window.location);
        url.searchParams.set('view', path);
        
        // Add any additional params
        Object.keys(params).forEach(key => {
            url.searchParams.set(key, params[key]);
        });
        
        window.history.pushState({}, '', url);
        this.handleRoute();
    }

    handleRoute() {
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view') || 'game';
        
        console.log('Routing to:', view);
        
        const handler = this.routes[view];
        if (handler) {
            handler(params);
        } else {
            console.error('No route found for:', view);
            this.routes['game'](params);
        }
    }

    start() {
        this.handleRoute();
    }
}

export const router = new Router();
