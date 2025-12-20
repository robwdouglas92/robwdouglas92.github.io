import { db } from '../firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { router } from '../router.js';
import { timer } from '../utils/timer.js';
import { shuffleArray, formatTime, getCurrentUserId, getCurrentUserName } from '../utils/helpers.js';

class GameComponent {
    constructor() {
        this.gameData = null;
        this.selectedWords = [];
        this.foundCategories = [];
        this.remainingWords = [];
        this.mistakes = 0;
        this.gameOver = false;
        this.message = '';
        this.messageType = '';
        this.MAX_MISTAKES = 4;
        this.solvePath = [];
    }

    async load(gameId) {
        console.log('Loading game:', gameId);
        
        try {
            const gameRef = doc(db, "LizzieConnectionGames", gameId);
            const resultsRef = collection(db, "LizzieConnectionResults");
            const snap = await getDoc(gameRef);

            if (snap.exists()) {
                this.gameData = snap.data();
                const allWords = this.gameData.categories.flatMap(cat => cat.words);
                this.remainingWords = shuffleArray([...allWords]);
                this.foundCategories = [];
                this.selectedWords = [];
                this.mistakes = 0;
                this.gameOver = false;
                this.message = '';
                this.solvePath = [];
                timer.reset();
                
                console.log('Game loaded successfully');
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

    toggleWord(word) {
        timer.start();
        const idx = this.selectedWords.indexOf(word);
        if (idx > -1) {
            this.selectedWords.splice(idx, 1);
        } else if (this.selectedWords.length < 4) {
            this.selectedWords.push(word);
        }
        this.render();
    }

    shuffleWords() {
        this.remainingWords = shuffleArray([...this.remainingWords]);
        this.message = 'Words shuffled!';
        this.messageType = 'info';
        this.render();
        setTimeout(() => {
            this.message = '';
            this.render();
        }, 2000);
    }

    deselectAll() {
        this.selectedWords = [];
        this.render();
    }

    submitGuess() {
        if (this.selectedWords.length !== 4) return;

        const matchedCategory = this.gameData.categories.find(cat => {
            const categoryWords = [...cat.words].sort();
            const selectedSorted = [...this.selectedWords].sort();
            return JSON.stringify(categoryWords) === JSON.stringify(selectedSorted);
        });

        if (matchedCategory) {
            this.solvePath.push({
                type: 'correct',
                words: [...this.selectedWords],
                category: matchedCategory.title,
                difficulty: matchedCategory.difficulty,
                timestamp: Date.now()
            });
            
            this.foundCategories.push(matchedCategory);
            this.remainingWords = this.remainingWords.filter(w => !this.selectedWords.includes(w));
            this.selectedWords = [];
            this.message = 'Correct! 🎉';
            this.messageType = 'success';
            
            if (this.foundCategories.length === this.gameData.categories.length) {
                this.gameOver = true;
                timer.stop();
                this.message = 'Congratulations! You won! 🎊';
                this.saveResult();
            }
        } else {
            const isOneAway = this.gameData.categories.some(cat => {
                if (this.foundCategories.some(fc => fc.title === cat.title)) return false;
                const matchCount = this.selectedWords.filter(word => 
                    cat.words.includes(word)
                ).length;
                return matchCount === 3;
            });

            this.solvePath.push({
                type: 'mistake',
                words: [...this.selectedWords],
                oneAway: isOneAway,
                timestamp: Date.now()
            });
            
            this.mistakes++;
            this.selectedWords = [];
            
            if (this.mistakes >= this.MAX_MISTAKES) {
                this.gameOver = true;
                timer.stop();
                this.message = 'Game Over! Better luck next time!';
                this.messageType = 'error';
                
                const unsolvedCategories = this.gameData.categories.filter(
                    cat => !this.foundCategories.some(fc => fc.title === cat.title)
                );
                this.foundCategories.push(...unsolvedCategories);
            } else {
                if (isOneAway) {
                    this.message = `So close! One away! 🤏 ${this.MAX_MISTAKES - this.mistakes} mistakes remaining.`;
                } else {
                    this.message = `Nope! ${this.MAX_MISTAKES - this.mistakes} mistakes remaining.`;
                }
                this.messageType = 'error';
            }
        }

        this.render();
        setTimeout(() => {
            if (this.mistakes < this.MAX_MISTAKES && this.foundCategories.length < this.gameData.categories.length) {
                this.message = '';
                this.render();
            }
        }, 2000);
    }

    async saveResult() {
        const userId = getCurrentUserId();
        const userName = getCurrentUserName();
        
        if (!userId || !this.gameData) return;
        
        const params = new URLSearchParams(window.location.search);
        const gameId = params.get("id");
        
        const result = {
            gameId: gameId,
            userId: userId,
            userName: userName,
            completedAt: new Date().toISOString(),
            timeSeconds: timer.getElapsed(),
            mistakes: this.mistakes,
            won: this.mistakes < this.MAX_MISTAKES,
            categoriesFound: this.foundCategories.length,
            solvePath: this.solvePath
        };
        
        try {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
            const resultsRef = collection(db, "LizzieConnectionResults");
            await addDoc(resultsRef, result);
            console.log('Game result saved with solve path');
        } catch (error) {
            console.error('Error saving result:', error);
        }
    }

    render() {
        const app = document.getElementById('app');
        const userName = getCurrentUserName();
        
        app.innerHTML = `
            <div class="container" style="padding: 1rem;">
                <header>
                    <h1>Family Connections</h1>
                    <p class="subtitle">Find groups of four items that share something in common</p>
                    ${timer.timerStarted ? `<p style="font-size: 1.5rem; font-weight: bold; color: #1f2937; margin-top: 0.5rem;">${timer.getCurrent()}</p>` : ''}
                    ${userName ? `<p style="font-size: 0.875rem; color: #6b7280; margin-top: 0.25rem;">Playing as: ${userName}</p>` : ''}
                    
                    <div style="margin-top: 1rem;">
                        <button class="nav-link" onclick="window.location.href='../../home.html'">🏠 Back to Home</button>
                        <button class="nav-link" id="view-stats-btn">📊 My Stats</button>
                        <button class="nav-link" id="view-leaderboard-btn">🏆 Leaderboard</button>
                    </div>
                </header>

                ${this.renderFoundCategories()}
                ${this.renderGameBoard()}
            </div>
        `;

        this.attachListeners();
    }

    renderFoundCategories() {
        return this.foundCategories.map(cat => `
            <div style="color: white; padding: 1rem; border-radius: 0.5rem; margin-bottom: 0.75rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); background: ${this.getCategoryColor(cat.difficulty)};">
                <div style="font-weight: bold; font-size: 1.125rem; margin-bottom: 0.25rem;">${cat.title.toUpperCase()}</div>
                <div style="font-size: 0.875rem; opacity: 0.9;">${cat.words.join(', ')}</div>
            </div>
        `).join('');
    }

    renderGameBoard() {
        if (this.gameOver) {
            return `
                <div style="text-align: center; margin-top: 2rem;">
                    <div style="font-size: 4rem; margin-bottom: 1.5rem;">${this.mistakes < this.MAX_MISTAKES ? '🏆' : '😅'}</div>
                    ${this.mistakes < this.MAX_MISTAKES ? `
                        <p style="font-size: 1.25rem; margin-bottom: 1rem;">
                            Time: <strong>${formatTime(timer.getElapsed())}</strong><br>
                            Mistakes: <strong>${this.mistakes}</strong>
                        </p>
                    ` : ''}
                    <button class="btn btn-primary" id="play-again-btn">🔄 Play Again</button>
                    <div style="margin-top: 1rem;">
                        <button class="nav-link" id="view-stats-btn-end">📊 My Stats</button>
                        <button class="nav-link" id="view-leaderboard-btn-end">🏆 Leaderboard</button>
                    </div>
                </div>
                ${this.renderSolvePath()}
            `;
        }

        if (this.remainingWords.length === 0) return '';

        return `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 1.5rem;">
                ${this.remainingWords.map(word => `
                    <button class="word-btn ${this.selectedWords.includes(word) ? 'selected' : ''}" data-word="${word}" style="padding: 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; background: ${this.selectedWords.includes(word) ? '#374151' : 'white'}; color: ${this.selectedWords.includes(word) ? 'white' : '#1f2937'}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: none; cursor: pointer; transition: all 0.2s;">
                        ${word}
                    </button>
                `).join('')}
            </div>

            <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; color: #4b5563;">
                <span>Mistakes remaining: ${this.MAX_MISTAKES - this.mistakes}</span>
                ${[...Array(this.MAX_MISTAKES)].map((_, idx) => `
                    <div style="width: 0.75rem; height: 0.75rem; border-radius: 50%; background: ${idx < this.mistakes ? '#ef4444' : '#d1d5db'};"></div>
                `).join('')}
            </div>

            ${this.message ? `<div class="message msg-${this.messageType}" style="text-align:center; margin-bottom:0.75rem;">${this.message}</div>` : ''}

            <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                <button class="btn btn-secondary" id="shuffle-btn">🔀 Shuffle</button>
                <button class="btn btn-secondary" id="deselect-btn">Deselect All</button>
                <button class="btn btn-primary" id="submit-btn" ${this.selectedWords.length !== 4 ? 'disabled' : ''}>Submit</button>
            </div>
        `;
    }

    getCategoryColor(difficulty) {
        const colors = {
            easy: '#facc15',
            medium: '#22c55e',
            hard: '#3b82f6',
            tricky: '#9333ea'
        };
        return colors[difficulty] || '#6b7280';
    }

    renderSolvePath() {
        if (!this.solvePath || this.solvePath.length === 0) return '';
        
        return `
            <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; margin-top: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h3 style="font-size: 1.125rem; font-weight: bold; margin-bottom: 1rem; color: #1f2937;">Your Solve Path</h3>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${this.solvePath.map((guess, idx) => `
                        <div class="solve-path-row" data-guess-idx="${idx}" style="display: flex; gap: 0.25rem; align-items: center; cursor: pointer; padding: 0.5rem; border-radius: 0.25rem; transition: background 0.2s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                            <span style="min-width: 1.5rem; font-size: 0.875rem; color: #6b7280; font-weight: 600;">${idx + 1}.</span>
                            <div style="display: flex; gap: 0.25rem; flex: 1;">
                                ${guess.words.map(word => {
                                    const difficulty = this.getWordDifficulty(word);
                                    const color = this.getCategoryColor(difficulty);
                                    return `<div style="flex: 1; height: 2rem; background: ${color}; border-radius: 0.25rem;" title="${word}"></div>`;
                                }).join('')}
                            </div>
                            ${guess.type === 'correct' ? 
                                `<span style="font-size: 0.875rem; color: #10b981; font-weight: 600;">✓</span>` : 
                                `<span style="font-size: 0.875rem; color: #ef4444; font-weight: 600;">${guess.oneAway ? '🤏' : '✗'}</span>`
                            }
                        </div>
                    `).join('')}
                </div>
                <div id="guess-detail" style="margin-top: 1rem; padding: 0.75rem; background: #f9fafb; border-radius: 0.5rem; font-size: 0.875rem; color: #4b5563; display: none;"></div>
            </div>
        `;
    }

    getWordDifficulty(word) {
        const category = this.gameData.categories.find(cat => 
            cat.words.includes(word)
        );
        return category ? category.difficulty : null;
    }

    attachListeners() {
        const params = new URLSearchParams(window.location.search);
        const gameId = params.get("id");

        // Word buttons
        document.querySelectorAll('.word-btn').forEach(btn => {
            btn.onclick = () => this.toggleWord(btn.dataset.word);
        });

        // Control buttons
        const shuffleBtn = document.getElementById('shuffle-btn');
        const deselectBtn = document.getElementById('deselect-btn');
        const submitBtn = document.getElementById('submit-btn');
        const playAgainBtn = document.getElementById('play-again-btn');

        if (shuffleBtn) shuffleBtn.onclick = () => this.shuffleWords();
        if (deselectBtn) deselectBtn.onclick = () => this.deselectAll();
        if (submitBtn) submitBtn.onclick = () => this.submitGuess();
        if (playAgainBtn) playAgainBtn.onclick = () => {
            this.load(gameId).then(() => this.render());
        };

        // Navigation buttons
        const viewStatsButtons = document.querySelectorAll('[id^="view-stats-btn"]');
        const viewLeaderboardButtons = document.querySelectorAll('[id^="view-leaderboard-btn"]');

        viewStatsButtons.forEach(btn => {
            btn.onclick = () => router.navigate('stats', { id: gameId });
        });

        viewLeaderboardButtons.forEach(btn => {
            btn.onclick = () => router.navigate('leaderboard');
        });

        // Solve path hover listeners
        document.querySelectorAll('.solve-path-row').forEach(row => {
            row.addEventListener('mouseenter', (e) => {
                const idx = parseInt(e.currentTarget.dataset.guessIdx);
                const guess = this.solvePath[idx];
                const detailDiv = document.getElementById('guess-detail');
                
                if (detailDiv && guess) {
                    detailDiv.style.display = 'block';
                    detailDiv.innerHTML = `
                        <strong>Guess ${idx + 1}:</strong> ${guess.words.join(', ')}
                        ${guess.type === 'correct' ? `<br><span style="color: #10b981;">✓ Found: ${guess.category}</span>` : ''}
                        ${guess.oneAway ? '<br><span style="color: #f59e0b;">One word away!</span>' : ''}
                    `;
                }
            });
        });
    }
}

export const gameComponent = new GameComponent();
