import { db } from '../firebase.js';
import { doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { router } from '../router.js';
import { timer } from '../utils/timer.js';
import { formatTime, getCurrentUserId, getCurrentUserName } from '../utils/helpers.js';
import { isValidWord } from '../utils/wordValidation.js';

class GameComponent {
    constructor() {
        this.gameData = null;
        this.gameId = null;
        this.currentGuess = '';
        this.guesses = [];
        this.gameOver = false;
        this.won = false;
        this.keyboard = {};
        this.solvePath = [];
        this.MAX_GUESSES = 6;
        this.message = '';
        this.messageType = '';
        this.isValidating = false;
        this.lastGuessIndex = -1; // Track which row just got animated
    }

    async load(gameId) {
        console.log('Loading Wordle game:', gameId);
        this.gameId = gameId;
        
        try {
            const gameRef = doc(db, "LizzieWordleGames", gameId);
            const resultsRef = collection(db, "LizzieWordleResults");
            const snap = await getDoc(gameRef);

            if (snap.exists()) {
                this.gameData = snap.data();
                this.currentGuess = '';
                this.guesses = [];
                this.gameOver = false;
                this.won = false;
                this.keyboard = this.initializeKeyboard();
                this.solvePath = [];
                this.message = '';
                timer.reset();
                
                // Set up timer update callback
                timer.onUpdate(() => this.updateTimer());
                
                console.log('Wordle game loaded successfully');
                return true;
            } else {
                this.message = "Game not found!";
                this.messageType = "error";
                return false;
            }
        } catch (error) {
            console.error("Error loading game:", error);
            this.message = "Error loading game.";
            this.messageType = "error";
            return false;
        }
    }

    initializeKeyboard() {
        const keys = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('');
        const keyboard = {};
        keys.forEach(key => {
            keyboard[key] = 'unused'; // unused, absent, present, correct
        });
        return keyboard;
    }

    handleKeyPress(key) {
        if (this.gameOver || this.isValidating) return;

        // Start timer on first key press
        timer.start();

        if (key === 'ENTER') {
            this.submitGuess();
        } else if (key === 'BACKSPACE') {
            this.currentGuess = this.currentGuess.slice(0, -1);
            this.render();
        } else if (this.currentGuess.length < 5 && /^[A-Z]$/.test(key)) {
            this.currentGuess += key;
            this.render();
        }
    }

    async submitGuess() {
        if (this.currentGuess.length !== 5) {
            this.showMessage('Word must be 5 letters', 'error');
            return;
        }

        // Validate word
        this.isValidating = true;
        this.showMessage('Validating word...', 'info');
        
        const valid = await isValidWord(this.currentGuess);
        this.isValidating = false;
        
        if (!valid) {
            this.showMessage('Not a valid word!', 'error');
            return;
        }

        // Calculate feedback
        const feedback = this.calculateFeedback(this.currentGuess, this.gameData.targetWord);
        
        // Add to guesses
        this.guesses.push({
            word: this.currentGuess,
            feedback: feedback
        });

        // Track this guess for animation
        this.lastGuessIndex = this.guesses.length - 1;

        // Update keyboard
        this.updateKeyboard(this.currentGuess, feedback);

        // Add to solve path
        this.solvePath.push({
            word: this.currentGuess,
            feedback: feedback
        });

        // Check win condition
        if (this.currentGuess === this.gameData.targetWord) {
            this.won = true;
            this.gameOver = true;
            timer.stop();
            this.showMessage('Congratulations! You won! 🎉', 'success');
            await this.saveResult();
        } else if (this.guesses.length >= this.MAX_GUESSES) {
            this.gameOver = true;
            timer.stop();
            this.showMessage(`Game Over! The word was ${this.gameData.targetWord}`, 'error');
            await this.saveResult();
        } else {
            this.showMessage('', '');
        }

        this.currentGuess = '';
        this.render();
        
        // Clear animation flag after render
        setTimeout(() => {
            this.lastGuessIndex = -1;
        }, 600); // Match animation duration
    }

    calculateFeedback(guess, target) {
        const feedback = Array(5).fill('absent');
        const targetLetters = target.split('');
        const guessLetters = guess.split('');
        
        // First pass: Mark correct positions (green)
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] === targetLetters[i]) {
                feedback[i] = 'correct';
                targetLetters[i] = null; // Mark as used
                guessLetters[i] = null;
            }
        }
        
        // Second pass: Mark present letters (yellow)
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] !== null) {
                const targetIndex = targetLetters.indexOf(guessLetters[i]);
                if (targetIndex !== -1) {
                    feedback[i] = 'present';
                    targetLetters[targetIndex] = null; // Mark as used
                }
            }
        }
        
        return feedback;
    }

    updateKeyboard(word, feedback) {
        const priority = { 'correct': 3, 'present': 2, 'absent': 1, 'unused': 0 };
        
        for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            const currentState = this.keyboard[letter];
            const newState = feedback[i];
            
            // Only update if new state has higher priority
            if (priority[newState] > priority[currentState]) {
                this.keyboard[letter] = newState;
            }
        }
    }

    showMessage(msg, type) {
        this.message = msg;
        this.messageType = type;
        this.render();
        
        if (msg && !this.gameOver) {
            setTimeout(() => {
                this.message = '';
                this.render();
            }, 2000);
        }
    }

    updateTimer() {
        // Update timer display without full re-render
        const timerEl = document.getElementById('game-timer');
        if (timerEl && timer.timerStarted) {
            timerEl.textContent = timer.getCurrent();
        }
    }

    async saveResult() {
        const userId = getCurrentUserId();
        const userName = getCurrentUserName();
        
        if (!userId || !this.gameData) return;
        
        const result = {
            gameId: this.gameId,
            userId: userId,
            userName: userName,
            completedAt: new Date().toISOString(),
            timeSeconds: timer.getElapsed(),
            won: this.won,
            guessCount: this.guesses.length,
            targetWord: this.gameData.targetWord,
            solvePath: this.solvePath
        };
        
        try {
            const resultsRef = collection(db, "wordleResults");
            await addDoc(resultsRef, result);
            console.log('Wordle result saved');
        } catch (error) {
            console.error('Error saving result:', error);
        }
    }

    render() {
        const app = document.getElementById('app');
        const userName = getCurrentUserName();
        
        app.innerHTML = `
            <div class="container" style="padding: 1rem; max-width: 500px;">
                <header>
                    <h1>Family Wordle</h1>
                    <p class="subtitle">Guess the 5-letter word in 6 tries</p>
                    ${timer.timerStarted ? `<p id="game-timer" style="font-size: 1.5rem; font-weight: bold; color: #1f2937; margin-top: 0.5rem;">${timer.getCurrent()}</p>` : ''}
                    ${userName ? `<p style="font-size: 0.875rem; color: #6b7280; margin-top: 0.25rem;">Playing as: ${userName}</p>` : ''}
                    
                    <div style="margin-top: 1rem;">
                        <button class="nav-link" onclick="window.location.href='../../home.html'">🏠 Back to Home</button>
                        <button class="nav-link" id="view-stats-btn">📊 My Stats</button>
                        <button class="nav-link" id="view-leaderboard-btn">🏆 Leaderboard</button>
                    </div>
                </header>

                ${this.message ? `<div class="message msg-${this.messageType}">${this.message}</div>` : ''}

                ${this.renderGrid()}
                ${!this.gameOver ? this.renderKeyboard() : this.renderGameOver()}
            </div>
        `;

        this.attachListeners();
    }

    renderGrid() {
        let html = '<div style="display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1.5rem;">';
        
        for (let i = 0; i < this.MAX_GUESSES; i++) {
            html += '<div style="display: flex; gap: 0.375rem; justify-content: center;">';
            
            if (i < this.guesses.length) {
                // Completed guess - only animate if this is the row that was just submitted
                const guess = this.guesses[i];
                const shouldAnimate = (i === this.lastGuessIndex);
                for (let j = 0; j < 5; j++) {
                    const letter = guess.word[j];
                    const state = guess.feedback[j];
                    html += this.renderTile(letter, state, true, shouldAnimate);
                }
            } else if (i === this.guesses.length && !this.gameOver) {
                // Current guess row
                for (let j = 0; j < 5; j++) {
                    const letter = this.currentGuess[j] || '';
                    html += this.renderTile(letter, 'current', false, false);
                }
            } else {
                // Empty rows
                for (let j = 0; j < 5; j++) {
                    html += this.renderTile('', 'empty', false, false);
                }
            }
            
            html += '</div>';
        }
        
        html += '</div>';
        return html;
    }

    renderTile(letter, state, isComplete, shouldAnimate = false) {
        const colors = {
            correct: '#6aaa64',
            present: '#c9b458',
            absent: '#787c7e',
            empty: '#ffffff',
            current: '#ffffff'
        };
        
        const borderColor = state === 'empty' ? '#d3d6da' : (state === 'current' ? '#878a8c' : colors[state]);
        const bgColor = state === 'empty' || state === 'current' ? '#ffffff' : colors[state];
        const textColor = state === 'empty' || state === 'current' ? '#000000' : '#ffffff';
        
        return `
            <div class="wordle-tile ${shouldAnimate ? 'flip-animation' : ''}" style="
                width: 62px;
                height: 62px;
                border: 2px solid ${borderColor};
                background: ${bgColor};
                color: ${textColor};
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 2rem;
                font-weight: bold;
                text-transform: uppercase;
                border-radius: 0.25rem;
            ">
                ${letter}
            </div>
        `;
    }

    renderKeyboard() {
        const rows = [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
        ];

        let html = '<div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;">';
        
        rows.forEach(row => {
            html += '<div style="display: flex; gap: 0.375rem;">';
            row.forEach(key => {
                html += this.renderKey(key);
            });
            html += '</div>';
        });
        
        html += '</div>';
        return html;
    }

    renderKey(key) {
        const state = this.keyboard[key] || 'unused';
        const colors = {
            correct: '#6aaa64',
            present: '#c9b458',
            absent: '#787c7e',
            unused: '#d3d6da'
        };
        
        const bgColor = colors[state];
        const textColor = state === 'unused' ? '#000000' : '#ffffff';
        const isSpecial = key === 'ENTER' || key === 'BACKSPACE';
        const width = isSpecial ? '65px' : '43px';
        const fontSize = isSpecial ? '0.75rem' : '1.25rem';
        const displayKey = key === 'BACKSPACE' ? '⌫' : key;
        
        return `
            <button 
                class="keyboard-key" 
                data-key="${key}"
                style="
                    width: ${width};
                    height: 58px;
                    background: ${bgColor};
                    color: ${textColor};
                    border: none;
                    border-radius: 0.25rem;
                    font-size: ${fontSize};
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.1s;
                    user-select: none;
                "
                onmousedown="this.style.transform='scale(0.95)'"
                onmouseup="this.style.transform='scale(1)'"
                onmouseleave="this.style.transform='scale(1)'"
            >
                ${displayKey}
            </button>
        `;
    }

    renderGameOver() {
        return `
            <div style="text-align: center; margin-top: 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">${this.won ? '🏆' : '😅'}</div>
                ${this.won ? `
                    <p style="font-size: 1.25rem; margin-bottom: 1rem;">
                        You solved it in ${this.guesses.length}/${this.MAX_GUESSES} guesses!<br>
                        Time: <strong>${formatTime(timer.getElapsed())}</strong>
                    </p>
                ` : `
                    <p style="font-size: 1.25rem; margin-bottom: 1rem;">
                        The word was: <strong>${this.gameData.targetWord}</strong>
                    </p>
                `}
                <button class="btn btn-primary" id="play-again-btn" style="margin-bottom: 1rem;">🔄 Play Again</button>
                <div>
                    <button class="nav-link" id="view-stats-btn-end">📊 My Stats</button>
                    <button class="nav-link" id="view-leaderboard-btn-end">🏆 Leaderboard</button>
                </div>
            </div>
            ${this.renderSolvePath()}
        `;
    }

    renderSolvePath() {
        if (!this.solvePath || this.solvePath.length === 0) return '';
        
        return `
            <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; margin-top: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h3 style="font-size: 1.125rem; font-weight: bold; margin-bottom: 1rem; color: #1f2937;">Your Guesses</h3>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${this.solvePath.map((guess, idx) => this.renderSolvePathRow(guess, idx)).join('')}
                </div>
            </div>
        `;
    }

    renderSolvePathRow(guess, idx) {
        const colors = {
            correct: '#6aaa64',
            present: '#c9b458',
            absent: '#787c7e'
        };

        return `
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span style="min-width: 1.5rem; font-size: 0.875rem; color: #6b7280; font-weight: 600;">${idx + 1}.</span>
                <div style="display: flex; gap: 0.25rem; flex: 1;">
                    ${guess.feedback.map((state, i) => `
                        <div style="
                            flex: 1;
                            height: 2.5rem;
                            background: ${colors[state]};
                            border-radius: 0.25rem;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-weight: bold;
                            font-size: 1.125rem;
                        " title="${guess.word[i]}">
                            ${guess.word[i]}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    attachListeners() {
        // Keyboard buttons
        document.querySelectorAll('.keyboard-key').forEach(btn => {
            btn.onclick = () => this.handleKeyPress(btn.dataset.key);
        });

        // Physical keyboard
        document.addEventListener('keydown', this.keyboardHandler);

        // Navigation buttons
        const viewStatsButtons = document.querySelectorAll('[id^="view-stats-btn"]');
        const viewLeaderboardButtons = document.querySelectorAll('[id^="view-leaderboard-btn"]');
        const playAgainBtn = document.getElementById('play-again-btn');

        viewStatsButtons.forEach(btn => {
            btn.onclick = () => router.navigate('stats', { id: this.gameId });
        });

        viewLeaderboardButtons.forEach(btn => {
            btn.onclick = () => router.navigate('leaderboard');
        });

        if (playAgainBtn) {
            playAgainBtn.onclick = () => {
                this.load(this.gameId).then(() => this.render());
            };
        }
    }

    keyboardHandler = (e) => {
        if (this.gameOver || this.isValidating) return;
        
        const key = e.key.toUpperCase();
        
        if (key === 'ENTER') {
            e.preventDefault();
            this.handleKeyPress('ENTER');
        } else if (key === 'BACKSPACE') {
            e.preventDefault();
            this.handleKeyPress('BACKSPACE');
        } else if (/^[A-Z]$/.test(key)) {
            e.preventDefault();
            this.handleKeyPress(key);
        }
    };
}

export const gameComponent = new GameComponent();
