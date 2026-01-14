import { db } from '../firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { router } from '../router.js';
import { formatTime } from '../utils/helpers.js';

class LeaderboardComponent {
    constructor() {
        this.allResults = [];
        this.loading = true;
        this.filter = 'perfectGames'; // 'perfectGames', 'fastestPerfect', 'mostBoards'
        this.showAll = false;
    }

    async load() {
        this.loading = true;
        
        try {
            const resultsRef = collection(db, "LizzieQuordleResults");
            const snapshot = await getDocs(resultsRef);
            
            this.allResults = [];
            snapshot.forEach(doc => {
                this.allResults.push(doc.data());
            });
            
            console.log('Loaded Quordle results:', this.allResults.length);
            this.loading = false;
            return true;
            
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.loading = false;
            return false;
        }
    }

    getTopByPerfectGames() {
        const perfectGames = this.allResults.filter(r => r.solvedCount === 4);
        perfectGames.sort((a, b) => {
            if (a.guessCount !== b.guessCount) {
                return a.guessCount - b.guessCount;
            }
            return a.timeSeconds - b.timeSeconds;
        });
        return this.showAll ? perfectGames : perfectGames.slice(0, 10);
    }

    getTopByFastestPerfect() {
        const perfectGames = this.allResults.filter(r => r.solvedCount === 4);
        perfectGames.sort((a, b) => a.timeSeconds - b.timeSeconds);
        return this.showAll ? perfectGames : perfectGames.slice(0, 10);
    }

    getPlayerStats() {
        const playerMap = {};
        
        this.allResults.forEach(result => {
            if (!playerMap[result.userId]) {
                playerMap[result.userId] = {
                    userId: result.userId,
                    userName: result.userName,
                    gamesPlayed: 0,
                    perfectGames: 0,
                    totalBoardsSolved: 0
                };
            }
            
            const player = playerMap[result.userId];
            player.gamesPlayed++;
            player.totalBoardsSolved += result.solvedCount;
            
            if (result.solvedCount === 4) {
                player.perfectGames++;
            }
        });
        
        return Object.values(playerMap).map(player => ({
            ...player,
            perfectRate: player.gamesPlayed > 0 ? Math.floor((player.perfectGames / player.gamesPlayed) * 100) : 0,
            avgBoardsSolved: player.gamesPlayed > 0 ? (player.totalBoardsSolved / player.gamesPlayed).toFixed(1) : 0
        }));
    }

    getTopByMostBoards() {
        const players = this.getPlayerStats().filter(p => p.gamesPlayed >= 3);
        players.sort((a, b) => {
            const avgDiff = parseFloat(b.avgBoardsSolved) - parseFloat(a.avgBoardsSolved);
            if (Math.abs(avgDiff) > 0.01) {
                return avgDiff;
            }
            return b.perfectGames - a.perfectGames;
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
                    <button class="nav-link ${this.filter === 'perfectGames' ? 'active' : ''}" id="filter-perfect">🎯 Best Perfect Games</button>
                    <button class="nav-link ${this.filter === 'fastestPerfect' ? 'active' : ''}" id="filter-fastest">⚡ Fastest Perfect</button>
                    <button class="nav-link ${this.filter === 'mostBoards' ? 'active' : ''}" id="filter-boards">📊 Most Boards Solved</button>
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
        
        if (this.filter === 'perfectGames' || this.filter === 'fastestPerfect') {
            totalCount = this.allResults.filter(r => r.solvedCount === 4).length;
        } else {
            totalCount = this.getPlayerStats().filter(p => p.gamesPlayed >= 3).length;
        }

        if (totalCount <= 10) {
            return '';
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

        if (this.filter === 'perfectGames') {
            data = this.getTopByPerfectGames();
            columns = ['Rank', 'Player', 'Guesses', 'Time', 'Date'];
            
            if (data.length === 0) {
                return `<p style="text-align: center; color: #6b7280;">No perfect games yet!</p>`;
            }

            return `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            ${columns.map(col => `<th style="padding: 0.75rem; text-align: ${col === 'Player' ? 'left' : 'center'}; font-size: 0.875rem; color: #6b7280;">${col}</th>`).join('')}
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
                                    <span style="font-size: 1.5rem; font-weight: bold; color: #10b981;">${result.guessCount}</span>
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-weight: 600; color: #1f2937;">
                                    ${formatTime(result.timeSeconds)}
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">
                                    ${new Date(result.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else if (this.filter === 'fastestPerfect') {
            data = this.getTopByFastestPerfect();
            columns = ['Rank', 'Player', 'Time', 'Guesses', 'Date'];
            
            if (data.length === 0) {
                return `<p style="text-align: center; color: #6b7280;">No perfect games yet!</p>`;
            }

            return `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            ${columns.map(col => `<th style="padding: 0.75rem; text-align: ${col === 'Player' ? 'left' : 'center'}; font-size: 0.875rem; color: #6b7280;">${col}</th>`).join('')}
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
                                    ${result.guessCount}/9
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">
                                    ${new Date(result.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else { // mostBoards
            data = this.getTopByMostBoards();
            columns = ['Rank', 'Player', 'Avg Boards', 'Perfect Games', 'Games Played', 'Perfect Rate'];
            
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
                                    <span style="display: inline-block; padding: 0.5rem 1rem; border-radius: 9999px; background: ${this.getAvgBoardsColor(player.avgBoardsSolved)}; color: white; font-size: 1.125rem; font-weight: bold;">
                                        ${player.avgBoardsSolved}
                                    </span>
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-weight: 600; color: #1f2937;">
                                    ${player.perfectGames}
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">
                                    ${player.gamesPlayed}
                                </td>
                                <td style="padding: 0.75rem; text-align: center;">
                                    <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; background: ${this.getPerfectRateColor(player.perfectRate)}; color: white; font-size: 0.875rem; font-weight: 600;">
                                        ${player.perfectRate}%
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    getRankEmoji(rank) {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    }

    getAvgBoardsColor(avg) {
        const avgNum = parseFloat(avg);
        if (avgNum >= 3.5) return '#10b981'; // green
        if (avgNum >= 3.0) return '#3b82f6'; // blue
        if (avgNum >= 2.5) return '#f59e0b'; // orange
        return '#ef4444'; // red
    }

    getPerfectRateColor(rate) {
        if (rate >= 80) return '#10b981'; // green
        if (rate >= 60) return '#3b82f6'; // blue
        if (rate >= 40) return '#f59e0b'; // orange
        return '#ef4444'; // red
    }

    attachListeners(gameId) {
        const backBtn = document.getElementById('back-btn');
        const perfectBtn = document.getElementById('filter-perfect');
        const fastestBtn = document.getElementById('filter-fastest');
        const boardsBtn = document.getElementById('filter-boards');
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

        if (perfectBtn) {
            perfectBtn.onclick = () => {
                this.filter = 'perfectGames';
                this.showAll = false;
                this.render(gameId);
            };
        }

        if (fastestBtn) {
            fastestBtn.onclick = () => {
                this.filter = 'fastestPerfect';
                this.showAll = false;
                this.render(gameId);
            };
        }

        if (boardsBtn) {
            boardsBtn.onclick = () => {
                this.filter = 'mostBoards';
                this.showAll = false;
                this.render(gameId);
            };
        }

        if (toggleBtn) {
            toggleBtn.onclick = () => this.toggleShowAll();
        }
    }
}

export const leaderboardComponent = new LeaderboardComponent();
