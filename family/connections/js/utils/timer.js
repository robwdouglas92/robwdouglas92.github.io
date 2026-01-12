class Timer {
    constructor() {
        this.startTime = null;
        this.endTime = null;
        this.timerStarted = false;
        this.updateInterval = null;
        this.onUpdateCallback = null;
    }

    start() {
        if (!this.timerStarted) {
            this.timerStarted = true;
            this.startTime = Date.now();
            
            // Update every second
            this.updateInterval = setInterval(() => {
                if (this.onUpdateCallback) {
                    this.onUpdateCallback(this.getElapsed());
                }
            }, 1000);
        }
    }

    stop() {
        if (this.timerStarted && !this.endTime) {
            this.endTime = Date.now();
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
        }
    }

    reset() {
        this.startTime = null;
        this.endTime = null;
        this.timerStarted = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    getElapsed() {
        if (!this.timerStarted) return 0;
        const now = this.endTime || Date.now();
        return Math.floor((now - this.startTime) / 1000);
    }

    getCurrent() {
        const elapsed = this.getElapsed();
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    onUpdate(callback) {
        this.onUpdateCallback = callback;
    }
}

export const timer = new Timer();
