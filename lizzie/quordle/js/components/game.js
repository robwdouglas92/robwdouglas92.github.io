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
        this.guesses = []; // Shared guesses across all 4 boards
        this.gameOver = false;
        this.solvedBoards = [false, false, false, false]; // Track which boards are solved
        this.keyboard = {};
        this.solvePath = [];
        this.MAX_GUESSES = 9;
        this.message = '';
        this.messageType = '';
        this.isValidating = false;
        this.lastGuessIndex = -1;
    }

    async load(gameId) {
        console.log('Loading Quordle game:', gameId);
        this.gameId = gameId;
        
        try {
            const gameRef = doc(db, "LizzieQuordleGames", gameId);
            const snap = await getDoc(gameRef);

            if (snap.exists()) {
                this.gameData = snap.data();
                this.currentGuess = '';
                this.guesses = [];
                this.gameOver = false;
                this.solvedBoards = [false, false, false, false];
                this.keyboard = this.initializeKeyboard();
                this.solvePath = [];
                this.message = '';
                timer.reset();
                
                timer.onUpdate(() => this.updateTimer());
                
                console.log('Quordle game loaded successfully');
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

        // Calculate feedback for all 4 boards
        const feedbacks = this.gameData.targetWords.map(targetWord => 
            this.calculateFeedback(this.currentGuess, targetWord)
        );

        // Add to guesses
        this.guesses.push({
            word: this.currentGuess,
            feedbacks: feedbacks // Array of 4 feedback arrays
        });

        this.lastGuessIndex = this.guesses.length - 1;

        // Update keyboard with best state from all boards
        this.updateKeyboardFromAllBoards(this.currentGuess, feedbacks);

        // Add to solve path
        this.solvePath.push({
            word: this.currentGuess,
            feedbacks: feedbacks
        });

        // Check if any boards just got solved
        feedbacks.forEach((feedback, boardIndex) => {
            if (!this.solvedBoards[boardIndex]) {
                const allCorrect = feedback.every(state => state === 'correct');
                if (allCorrect) {
                    this.solvedBoards[boardIndex] = true;
                }
            }
        });

        // Check win condition (all 4 boards solved)
        if (this.solvedBoards.every(solved => solved)) {
            this.gameOver = true;
            timer.stop();
            this.showMessage('Congratulations! You solved all 4 words! 🎉', 'success');
            await this.saveResult();
        } else if (this.guesses.length >= this.MAX_GUESSES) {
            this.gameOver = true;
            timer.stop();
            const solvedCount = this.solvedBoards.filter(s => s).length;
            this.showMessage(`Game Over! You solved ${solvedCount}/4 boards`, 'error');
            await this.saveResult();
        } else {
            // Show how many boards are solved
            const solvedCount = this.solvedBoards.filter(s => s).length;
            if (solvedCount > 0) {
                this.showMessage(`${solvedCount}/4 boards solved!`, 'success');
            } else {
                this.showMessage('', '');
            }
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

    updateKeyboardFromAllBoards(word, feedbacks) {
        const priority = { 'correct': 3, 'present': 2, 'absent': 1, 'unused': 0 };
        
        for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            const currentState = this.keyboard[letter];
            
            // Find the best state across all 4 boards for this letter
            let bestState = 'absent';
            feedbacks.forEach(feedback => {
                if (priority[feedback[i]] > priority[bestState]) {
                    bestState = feedback[i];
                }
            });
            
            // Update if new state has higher priority
            if (priority[bestState] > priority[currentState]) {
                this.keyboard[letter] = bestState;
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
        
        const solvedCount = this.solvedBoards.filter(s => s).length;
        const won = solvedCount === 4;
        
        const result = {
            gameId: this.gameId,
            userId: userId,
            userName: userName,
            completedAt: new Date().toISOString(),
            timeSeconds: timer.getElapsed(),
            won: won,
            solvedCount: solvedCount,
            guessCount: this.guesses.length,
            targetWords: this.gameData.targetWords,
            solvePath: this.solvePath
        };
        
        try {
            const resultsRef = collection(db, "LizzieQuordleResults");
            await addDoc(resultsRef, result);
            console.log('Quordle result saved');
        } catch (error) {
            console.error('Error saving result:', error);
        }
    }

    render() {
        const app = document.getElementById('app');
        const userName = getCurrentUserName();
        
        app.innerHTML = `
            <div style="display: flex; flex-direction: column; min-height: 100vh; max-width: 1200px; margin: 0 auto;">
                <header style="position: sticky; top: 0; background: white; z-index: 100; border-bottom: 1px solid #d1d5db; padding: 0.25rem 0.5rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <button class="nav-link" onclick="window.location.href='../home.html'" style="font-size: 1.5rem; padding: 0.25rem; background: none; border: none; cursor: pointer;">🏠</button>
                        <div class="header-info" style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; color: #6b7280;">
                            ${timer.timerStarted ? `<span id="game-timer">${timer.getCurrent()}</span>` : ''}
                            ${userName ? `<span>${userName}</span>` : ''}
                        </div>
                        <div style="display: flex; gap: 0.25rem;">
                            <button class="nav-link" id="view-stats-btn" style="font-size: 1.5rem; padding: 0.25rem; background: none; border: none; cursor: pointer;">📊</button>
                            <button class="nav-link" id="view-leaderboard-btn" style="font-size: 1.5rem; padding: 0.25rem; background: none; border: none; cursor: pointer;">🏆</button>
                        </div>
                    </div>
                </header>

                ${this.message ? `<div class="message msg-${this.messageType}" style="margin: 0.5rem;">${this.message}</div>` : ''}

                <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 1rem; padding: 1rem 0.5rem; overflow: auto;">
                    ${!this.gameOver ? this.renderGrids() : this.renderGameOver()}
                    ${!this.gameOver ? this.renderKeyboard() : ''}
                </div>
            </div>

            <style>
                @media (orientation: landscape) and (max-height: 600px) {
                    .header-info {
                        display: none !important;
                    }
                }
            </style>
        `;

        this.attachListeners();
    }

    renderGrids() {
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 0.75rem; margin-bottom: 1rem;">
                ${this.gameData.targetWords.map((_, boardIndex) => this.renderBoard(boardIndex)).join('')}
            </div>
        `;
    }

    renderBoard(boardIndex) {
        const isSolved = this.solvedBoards[boardIndex];
        const borderColor = isSolved ? '#10b981' : '#d1d5db';
        
        let html = `<div style="border: 3px solid ${borderColor}; border-radius: 0.5rem; padding: 0.5rem; background: white;">`;
        
        // Board header
        html += `<div style="text-align: center; font-size: 0.75rem; font-weight: bold; color: ${isSolved ? '#10b981' : '#6b7280'}; margin-bottom: 0.5rem;">
            ${isSolved ? '✓ SOLVED' : `Board ${boardIndex + 1}`}
        </div>`;
        
        // Grid
        html += '<div style="display: flex; flex-direction: column; gap: 0.25rem;">';
        
        for (let i = 0; i < this.MAX_GUESSES; i++) {
            html += '<div style="display: flex; gap: 0.25rem; justify-content: center;">';
            
            if (i < this.guesses.length) {
                const guess = this.guesses[i];
                const feedback = guess.feedbacks[boardIndex];
                const shouldAnimate = (i === this.lastGuessIndex);
                for (let j = 0; j < 5; j++) {
                    const letter = guess.word[j];
                    const state = feedback[j];
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
        
        html += '</div></div>';
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
            <div class="quordle-tile ${shouldAnimate ? 'flip-animation' : ''}" style="
                width: min(40px, 8vw);
                height: min(40px, 8vw);
                border: 2px solid ${borderColor};
                background: ${bgColor};
                color: ${textColor};
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: clamp(0.875rem, 2.5vw, 1.25rem);
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

        let html = '<div style="display: flex; flex-direction: column; gap: 0.3rem; align-items: center; margin-top: auto;">';
        
        rows.forEach(row => {
            html += '<div style="display: flex; gap: 0.25rem; width: 100%; max-width: 600px; justify-content: center;">';
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
                    touch-action: manipulation;
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
        const solvedCount = this.solvedBoards.filter(s => s).length;
        const won = solvedCount === 4;
        
        return `
            <div style="text-align: center; margin-top: 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">${won ? '🏆' : '😅'}</div>
                ${won ? `
                    <p style="font-size: 1.25rem; margin-bottom: 1rem;">
                        You solved all 4 words in ${this.guesses.length}/${this.MAX_GUESSES} guesses!<br>
                        Time: <strong>${formatTime(timer.getElapsed())}</strong>
                    </p>
                ` : `
                    <p style="font-size: 1.25rem; margin-bottom: 1rem;">
                        You solved ${solvedCount}/4 boards<br>
                        ${this.renderUnsolvedWords()}
                    </p>
                `}
                
                ${this.renderFinalBoards()}
                
                <button class="btn btn-primary" id="play-again-btn" style="margin: 1rem 0;">🔄 Play Again</button>
                <div>
                    <button class="nav-link" id="view-stats-btn-end">📊 My Stats</button>
                    <button class="nav-link" id="view-leaderboard-btn-end">🏆 Leaderboard</button>
                </div>
            </div>
        `;
    }

    renderUnsolvedWords() {
        const unsolved = this.gameData.targetWords
            .filter((_, idx) => !this.solvedBoards[idx])
            .map((word, idx) => `<strong>${word}</strong>`)
            .join(', ');
        return unsolved ? `Missing: ${unsolved}` : '';
    }

    renderFinalBoards() {
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 0.75rem; margin: 2rem 0;">
                ${this.gameData.targetWords.map((_, boardIndex) => this.renderBoard(boardIndex)).join('')}
            </div>
        `;
    }

    attachListeners() {
        document.querySelectorAll('.keyboard-key').forEach(btn => {
            btn.onclick = () => this.handleKeyPress(btn.dataset.key);
        });

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
