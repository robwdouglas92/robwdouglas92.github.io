import { db } from '../firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { router } from '../router.js';
import { formatTime } from '../utils/helpers.js';

class LeaderboardComponent {
    constructor() {
        this.allResults = [];
        this.loading = true;
        this.filter = 'fewestGuesses'; // 'fewestGuesses', 'fastestTimes', 'bestWinRate'
        this.showAll = false; // New property to track if showing all results
    }

    async load() {
        this.loading = true;
        
        try {
            const resultsRef = collection(db, "LizzieWordleResults");
            const snapshot = await getDocs(resultsRef);
            
            this.allResults = [];
            snapshot.forEach(doc => {
                this.allResults.push(doc.data());
            });
            
            console.log('Loaded Wordle results:', this.allResults.length);
            this.loading = false;
            return true;
            
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.loading = false;
            return false;
        }
    }

    getTopByFewestGuesses() {
        const wonGames = this.allResults.filter(r => r.won);
        wonGames.sort((a, b) => {
            if (a.guessCount !== b.guessCount) {
                return a.guessCount - b.guessCount;
            }
            return a.timeSeconds - b.timeSeconds;
        });
        return this.showAll ? wonGames : wonGames.slice(0, 10);
    }

    getTopByFastestTimes() {
        const wonGames = this.allResults.filter(r => r.won);
        wonGames.sort((a, b) => a.timeSeconds - b.timeSeconds);
        return this.showAll ? wonGames : wonGames.slice(0, 10);
    }

    getPlayerStats() {
        const playerMap = {};
        
        this.allResults.forEach(result => {
            if (!playerMap[result.userId]) {
                playerMap[result.userId] = {
                    userId: result.userId,
                    userName: result.userName,
                    gamesPlayed: 0,
                    gamesWon: 0,
                    totalGuesses: 0,
                    gamesWithGuesses: 0
                };
            }
            
            const player = playerMap[result.userId];
            player.gamesPlayed++;
            
            if (result.won) {
                player.gamesWon++;
                player.totalGuesses += result.guessCount;
                player.gamesWithGuesses++;
            }
        });
        
        return Object.values(playerMap).map(player => ({
            ...player,
            winRate: player.gamesPlayed > 0 ? Math.floor((player.gamesWon / player.gamesPlayed) * 100) : 0,
            avgGuesses: player.gamesWithGuesses > 0 ? (player.totalGuesses / player.gamesWithGuesses).toFixed(1) : null
        }));
    }

    getTopByWinRate() {
        const players = this.getPlayerStats().filter(p => p.gamesPlayed >= 3);
        players.sort((a, b) => {
            if (b.winRate !== a.winRate) {
                return b.winRate - a.winRate;
            }
            return b.gamesWon - a.gamesWon;
        });
        return this.showAll ? players : players.slice(0, 10);
    }

    toggleShowAll() {
        this.showAll = !this.showAll;
        this.render();
    }

    render(gameId) {
        const app = document.getElementById('app');
        
        if (this.loading) {
            app.innerHTML = `
                <div class="container">
                    <div style="text-align: center; padding: 3rem;">
                        <p style="font-size: 1.25rem; color: #6b7280;">Loading leaderboard...</p>
                    </div>
                </div>
            `;
            return;
        }

        if (this.allResults.length === 0) {
            app.innerHTML = `
                <div class="container">
                    <header>
                        <h1>🏆 Leaderboard</h1>
                        <p class="subtitle">No games played yet!</p>
                    </header>
                    <div style="text-align: center; padding: 2rem; background: white; border-radius: 0.5rem; margin-top: 2rem;">
                        <p style="font-size: 4rem; margin-bottom: 1rem;">🎮</p>
                        <p style="color: #6b7280; margin-bottom: 1.5rem;">Be the first to complete a game!</p>
                        <button class="btn btn-primary" id="back-btn">Go to Game</button>
                    </div>
                </div>
            `;
            
            document.getElementById('back-btn').onclick = () => {
                if (gameId) {
                    router.navigate('game', { id: gameId });
                } else {
                    history.back();
                }
            };
            return;
        }

        app.innerHTML = `
            <div class="wide-container" style="padding: 1rem;">
                <header>
                    <h1>🏆 Leaderboard</h1>
                    <button class="nav-link" id="back-btn" style="margin-top: 0.5rem;">← Back to Game</button>
                </header>

                <div style="display: flex; gap: 0.5rem; margin-bottom: 2rem; flex-wrap: wrap; justify-content: center;">
                    <button class="nav-link ${this.filter === 'fewestGuesses' ? 'active' : ''}" id="filter-guesses">🎯 Fewest Guesses</button>
                    <button class="nav-link ${this.filter === 'fastestTimes' ? 'active' : ''}" id="filter-fastest">⚡ Fastest Times</button>
                    <button class="nav-link ${this.filter === 'bestWinRate' ? 'active' : ''}" id="filter-winrate">📈 Best Win Rate</button>
                </div>

                <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow-x: auto;">
                    ${this.renderLeaderboard()}
                </div>

                ${this.renderShowAllButton()}
            </div>
        `;

        this.attachListeners(gameId);
    }

    renderShowAllButton() {
        let totalCount = 0;
        
        if (this.filter === 'fewestGuesses' || this.filter === 'fastestTimes') {
            totalCount = this.allResults.filter(r => r.won).length;
        } else {
            totalCount = this.getPlayerStats().filter(p => p.gamesPlayed >= 3).length;
        }

        if (totalCount <= 10) {
            return ''; // Don't show button if 10 or fewer results
        }

        return `
            <div style="text-align: center; margin-top: 1.5rem;">
                <button class="btn btn-secondary" id="toggle-show-all" style="padding: 0.75rem 1.5rem;">
                    ${this.showAll ? `📊 Show Top 10 Only` : `📋 Show All ${totalCount} Results`}
                </button>
            </div>
        `;
    }

    renderLeaderboard() {
        let data = [];
        let columns = [];

        if (this.filter === 'fewestGuesses') {
            data = this.getTopByFewestGuesses();
            columns = ['Rank', 'Player', 'Guesses', 'Word', 'Time', 'Date', 'Path'];
            
            if (data.length === 0) {
                return `<p style="text-align: center; color: #6b7280;">No completed games yet!</p>`;
            }

            return `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            ${columns.map(col => `<th style="padding: 0.75rem; text-align: ${col === 'Player' || col === 'Word' ? 'left' : 'center'}; font-size: 0.875rem; color: #6b7280;">${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((result, idx) => `
                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                <td style="padding: 0.75rem; text-align: center;">
                                    <span style="font-size: 1.25rem; font-weight: bold;">${this.getRankEmoji(idx + 1)}</span>
                                </td>
                                <td style="padding: 0.75rem;">
                                    <div style="font-weight: 600;">${result.userName}</div>
                                </td>
                                <td style="padding: 0.75rem; text-align: center;">
                                    <span style="font-size: 1.5rem; font-weight: bold; color: #6aaa64;">${result.guessCount}</span>
                                </td>
                                <td style="padding: 0.75rem;">
                                    <span style="font-family: monospace; font-weight: bold;">${result.targetWord}</span>
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-weight: 600; color: #1f2937;">
                                    ${formatTime(result.timeSeconds)}
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">
                                    ${new Date(result.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </td>
                                <td style="padding: 0.75rem; text-align: center;">
                                    ${this.renderMiniSolvePath(result.solvePath)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else if (this.filter === 'fastestTimes') {
            data = this.getTopByFastestTimes();
            columns = ['Rank', 'Player', 'Time', 'Guesses', 'Word', 'Date', 'Path'];
            
            if (data.length === 0) {
                return `<p style="text-align: center; color: #6b7280;">No completed games yet!</p>`;
            }

            return `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            ${columns.map(col => `<th style="padding: 0.75rem; text-align: ${col === 'Player' || col === 'Word' ? 'left' : 'center'}; font-size: 0.875rem; color: #6b7280;">${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((result, idx) => `
                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                <td style="padding: 0.75rem; text-align: center;">
                                    <span style="font-size: 1.25rem; font-weight: bold;">${this.getRankEmoji(idx + 1)}</span>
                                </td>
                                <td style="padding: 0.75rem;">
                                    <div style="font-weight: 600;">${result.userName}</div>
                                </td>
                                <td style="padding: 0.75rem; text-align: center;">
                                    <span style="font-size: 1.5rem; font-weight: bold; color: #3b82f6;">${formatTime(result.timeSeconds)}</span>
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-weight: 600; color: #1f2937;">
                                    ${result.guessCount}/6
                                </td>
                                <td style="padding: 0.75rem;">
                                    <span style="font-family: monospace; font-weight: bold;">${result.targetWord}</span>
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">
                                    ${new Date(result.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </td>
                                <td style="padding: 0.75rem; text-align: center;">
                                    ${this.renderMiniSolvePath(result.solvePath)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else { // bestWinRate
            data = this.getTopByWinRate();
            columns = ['Rank', 'Player', 'Win Rate', 'Wins', 'Games', 'Avg Guesses'];
            
            if (data.length === 0) {
                return `<p style="text-align: center; color: #6b7280;">Players need at least 3 games to appear here!</p>`;
            }

            return `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            ${columns.map(col => `<th style="padding: 0.75rem; text-align: ${col === 'Player' ? 'left' : 'center'}; font-size: 0.875rem; color: #6b7280;">${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((player, idx) => `
                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                <td style="padding: 0.75rem; text-align: center;">
                                    <span style="font-size: 1.25rem; font-weight: bold;">${this.getRankEmoji(idx + 1)}</span>
                                </td>
                                <td style="padding: 0.75rem;">
                                    <div style="font-weight: 600;">${player.userName}</div>
                                </td>
                                <td style="padding: 0.75rem; text-align: center;">
                                    <span style="display: inline-block; padding: 0.5rem 1rem; border-radius: 9999px; background: ${this.getWinRateColor(player.winRate)}; color: white; font-size: 1.125rem; font-weight: bold;">
                                        ${player.winRate}%
                                    </span>
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-weight: 600; color: #1f2937;">
                                    ${player.gamesWon}
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">
                                    ${player.gamesPlayed}
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-weight: 600; color: #1f2937;">
                                    ${player.avgGuesses || 'N/A'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    renderMiniSolvePath(solvePath) {
        if (!solvePath || solvePath.length === 0) return '<span style="color: #9ca3af; font-size: 0.75rem;">—</span>';
        
        const colors = {
            correct: '#6aaa64',
            present: '#c9b458',
            absent: '#787c7e'
        };

        return `
            <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
                ${solvePath.map((guess, idx) => `
                    <div style="display: flex; gap: 1px;" title="Guess ${idx + 1}: ${guess.word}">
                        ${guess.feedback.map(state => `
                            <div style="width: 8px; height: 8px; background: ${colors[state]}; border-radius: 1px;"></div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        `;
    }

    getRankEmoji(rank) {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    }

    getWinRateColor(winRate) {
        if (winRate >= 80) return '#10b981'; // green
        if (winRate >= 60) return '#3b82f6'; // blue
        if (winRate >= 40) return '#f59e0b'; // orange
        return '#ef4444'; // red
    }

    attachListeners(gameId) {
        const backBtn = document.getElementById('back-btn');
        const guessesBtn = document.getElementById('filter-guesses');
        const fastestBtn = document.getElementById('filter-fastest');
        const winrateBtn = document.getElementById('filter-winrate');
        const toggleBtn = document.getElementById('toggle-show-all');

        if (backBtn) {
            backBtn.onclick = () => {
                if (gameId) {
                    router.navigate('game', { id: gameId });
                } else {
                    history.back();
                }
            };
        }

        if (guessesBtn) {
            guessesBtn.onclick = () => {
                this.filter = 'fewestGuesses';
                this.showAll = false; // Reset to top 10 when changing filters
                this.render(gameId);
            };
        }

        if (fastestBtn) {
            fastestBtn.onclick = () => {
                this.filter = 'fastestTimes';
                this.showAll = false; // Reset to top 10 when changing filters
                this.render(gameId);
            };
        }

        if (winrateBtn) {
            winrateBtn.onclick = () => {
                this.filter = 'bestWinRate';
                this.showAll = false; // Reset to top 10 when changing filters
                this.render(gameId);
            };
        }

        if (toggleBtn) {
            toggleBtn.onclick = () => this.toggleShowAll();
        }
    }
}

export const leaderboardComponent = new LeaderboardComponent();
