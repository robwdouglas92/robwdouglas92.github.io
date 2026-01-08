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
        this.lastGuessIndex = -1;
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
            keyboard[key] = 'unused';
        });
        return keyboard;
    }

    handleKeyPress(key) {
        if (this.gameOver || this.isValidating) return;

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

        this.isValidating = true;
        this.showMessage('Validating word...', 'info');
        
        const valid = await isValidWord(this.currentGuess);
        this.isValidating = false;
        
        if (!valid) {
            this.showMessage('Not a valid word!', 'error');
            return;
        }

        const feedback = this.calculateFeedback(this.currentGuess, this.gameData.targetWord);
        
        this.guesses.push({
            word: this.currentGuess,
            feedback: feedback
        });

        this.lastGuessIndex = this.guesses.length - 1;

        this.updateKeyboard(this.currentGuess, feedback);

        this.solvePath.push({
            word: this.currentGuess,
            feedback: feedback
        });

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
        
        setTimeout(() => {
            this.lastGuessIndex = -1;
        }, 600);
    }

    calculateFeedback(guess, target) {
        const feedback = Array(5).fill('absent');
        const targetLetters = target.split('');
        const guessLetters = guess.split('');
        
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] === targetLetters[i]) {
                feedback[i] = 'correct';
                targetLetters[i] = null;
                guessLetters[i] = null;
            }
        }
        
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] !== null) {
                const targetIndex = targetLetters.indexOf(guessLetters[i]);
                if (targetIndex !== -1) {
                    feedback[i] = 'present';
                    targetLetters[targetIndex] = null;
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
            const resultsRef = collection(db, "LizzieWordleResults");
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
            <div style="display: flex; flex-direction: column; min-height: 100vh; max-width: 500px; margin: 0 auto; padding: 0.5rem;">
                <header style="text-align: center; padding: 0.5rem 0; border-bottom: 1px solid #d1d5db;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <button class="nav-link" onclick="window.location.href='../home.html'" style="font-size: 1.25rem; padding: 0.25rem 0.5rem; background: none; border: none;">🏠</button>
                        <h1 style="font-size: 1.75rem; font-weight: bold; color: #1f2937; margin: 0;">Wordle</h1>
                        <div style="display: flex; gap: 0.25rem;">
                            <button class="nav-link" id="view-stats-btn" style="font-size: 1.25rem; padding: 0.25rem 0.5rem; background: none; border: none;">📊</button>
                            <button class="nav-link" id="view-leaderboard-btn" style="font-size: 1.25rem; padding: 0.25rem 0.5rem; background: none; border: none;">🏆</button>
                        </div>
                    </div>
                    ${timer.timerStarted || userName ? `
                        <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">
                            ${timer.timerStarted ? `<span id="game-timer">${timer.getCurrent()}</span>` : ''}
                            ${userName ? `<span>${userName}</span>` : ''}
                        </div>
                    ` : ''}
                </header>

                ${this.message ? `<div class="message msg-${this.messageType}" style="margin: 0.5rem 0;">${this.message}</div>` : ''}

                <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 1rem; padding: 0.5rem 0;">
                    ${this.renderGrid()}
                    ${!this.gameOver ? this.renderKeyboard() : this.renderGameOver()}
                </div>
            </div>
        `;

        this.attachListeners();
    }

    renderGrid() {
        let html = '<div style="display: flex; flex-direction: column; gap: 0.3rem;">';
        
        for (let i = 0; i < this.MAX_GUESSES; i++) {
            html += '<div style="display: flex; gap: 0.3rem; justify-content: center;">';
            
            if (i < this.guesses.length) {
                const guess = this.guesses[i];
                const shouldAnimate = (i === this.lastGuessIndex);
                for (let j = 0; j < 5; j++) {
                    const letter = guess.word[j];
                    const state = guess.feedback[j];
                    html += this.renderTile(letter, state, true, shouldAnimate);
                }
            } else if (i === this.guesses.length && !this.gameOver) {
                for (let j = 0; j < 5; j++) {
                    const letter = this.currentGuess[j] || '';
                    html += this.renderTile(letter, 'current', false, false);
                }
            } else {
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
                width: min(62px, 15vw);
                height: min(62px, 15vw);
                border: 2px solid ${borderColor};
                background: ${bgColor};
                color: ${textColor};
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: clamp(1.5rem, 4vw, 2rem);
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

        let html = '<div style="display: flex; flex-direction: column; gap: 0.3rem; align-items: center;">';
        
        rows.forEach(row => {
            html += '<div style="display: flex; gap: 0.25rem; width: 100%; justify-content: center;">';
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
        
        const displayKey = key === 'BACKSPACE' ? '⌫' : key;
        
        return `
            <button 
                class="keyboard-key" 
                data-key="${key}"
                style="
                    flex: ${isSpecial ? '1.5' : '1'};
                    min-width: 0;
                    height: min(58px, 13vw);
                    background: ${bgColor};
                    color: ${textColor};
                    border: none;
                    border-radius: 0.25rem;
                    font-size: ${isSpecial ? 'clamp(0.65rem, 2.5vw, 0.75rem)' : 'clamp(1rem, 3.5vw, 1.25rem)'};
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.1s;
                    user-select: none;
                    padding: 0.25rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
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
        document.querySelectorAll('.keyboard-key').forEach(btn => {
            btn.onclick = () => this.handleKeyPress(btn.dataset.key);
        });

        // Remove old listener if it exists, then add new one
        document.removeEventListener('keydown', this.keyboardHandler);
        document.addEventListener('keydown', this.keyboardHandler);

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

export const gameComponent = new GameComponent();
