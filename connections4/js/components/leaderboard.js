import { db } from '../firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { router } from '../router.js';
import { formatTime } from '../utils/helpers.js';

class LeaderboardComponent {
    constructor() {
        this.allResults = [];
        this.loading = true;
        this.filter = 'fastest'; // 'fastest', 'mostWins', 'bestWinRate'
    }

    async load() {
        this.loading = true;
        
        try {
            const resultsRef = collection(db, "gameResults");
            const snapshot = await getDocs(resultsRef);
            
            this.allResults = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                this.allResults.push(data);
            });
            
            console.log('Loaded results:', this.allResults.length);
            this.loading = false;
            return true;
            
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.loading = false;
            return false;
        }
    }

    getTopFastest() {
        const wonGames = this.allResults.filter(r => r.won);
        wonGames.sort((a, b) => a.timeSeconds - b.timeSeconds);
        return wonGames.slice(0, 10);
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
                    totalTime: 0,
                    bestTime: null,
                    times: []
                };
            }
            
            const player = playerMap[result.userId];
            player.gamesPlayed++;
            
            if (result.won) {
                player.gamesWon++;
                player.totalTime += result.timeSeconds;
                player.times.push(result.timeSeconds);
                
                if (!player.bestTime || result.timeSeconds < player.bestTime) {
                    player.bestTime = result.timeSeconds;
                }
            }
        });
        
        return Object.values(playerMap).map(player => ({
            ...player,
            winRate: player.gamesPlayed > 0 ? Math.floor((player.gamesWon / player.gamesPlayed) * 100) : 0,
            avgTime: player.gamesWon > 0 ? Math.floor(player.totalTime / player.gamesWon) : null
        }));
    }

    getTopByMostWins() {
        const players = this.getPlayerStats();
        players.sort((a, b) => b.gamesWon - a.gamesWon);
        return players.slice(0, 10);
    }

    getTopByWinRate() {
        const players = this.getPlayerStats().filter(p => p.gamesPlayed >= 3); // At least 3 games
        players.sort((a, b) => b.winRate - a.winRate);
        return players.slice(0, 10);
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
                    <button class="nav-link ${this.filter === 'fastest' ? 'active' : ''}" id="filter-fastest">⚡ Fastest Times</button>
                    <button class="nav-link ${this.filter === 'mostWins' ? 'active' : ''}" id="filter-wins">🏆 Most Wins</button>
                    <button class="nav-link ${this.filter === 'bestWinRate' ? 'active' : ''}" id="filter-winrate">📈 Best Win Rate</button>
                </div>

                <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow-x: auto;">
                    ${this.renderLeaderboard()}
                </div>
            </div>
        `;

        this.attachListeners(gameId);
    }

    renderLeaderboard() {
        let data = [];
        let columns = [];

        if (this.filter === 'fastest') {
            data = this.getTopFastest();
            columns = ['Rank', 'Player', 'Time', 'Date'];
            
            if (data.length === 0) {
                return `<p style="text-align: center; color: #6b7280;">No completed games yet!</p>`;
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
        } else if (this.filter === 'mostWins') {
            data = this.getTopByMostWins();
            columns = ['Rank', 'Player', 'Wins', 'Games', 'Win Rate'];
            
            if (data.length === 0) {
                return `<p style="text-align: center; color: #6b7280;">No players yet!</p>`;
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
                                <td style="padding: 0.75rem; text-align: center; font-size: 1.25rem; font-weight: bold; color: #1f2937;">
                                    ${player.gamesWon}
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">
                                    ${player.gamesPlayed}
                                </td>
                                <td style="padding: 0.75rem; text-align: center; font-weight: 600;">
                                    <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; background: ${this.getWinRateColor(player.winRate)}; color: white; font-size: 0.875rem;">
                                        ${player.winRate}%
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else { // bestWinRate
            data = this.getTopByWinRate();
            columns = ['Rank', 'Player', 'Win Rate', 'Wins', 'Games'];
            
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

    getWinRateColor(winRate) {
        if (winRate >= 80) return '#10b981'; // green
        if (winRate >= 60) return '#3b82f6'; // blue
        if (winRate >= 40) return '#f59e0b'; // orange
        return '#ef4444'; // red
    }

    attachListeners(gameId) {
        const backBtn = document.getElementById('back-btn');
        const fastestBtn = document.getElementById('filter-fastest');
        const winsBtn = document.getElementById('filter-wins');
        const winrateBtn = document.getElementById('filter-winrate');

        if (backBtn) {
            backBtn.onclick = () => {
                if (gameId) {
                    router.navigate('game', { id: gameId });
                } else {
                    history.back();
                }
            };
        }

        if (fastestBtn) {
            fastestBtn.onclick = () => {
                this.filter = 'fastest';
                this.render(gameId);
            };
        }

        if (winsBtn) {
            winsBtn.onclick = () => {
                this.filter = 'mostWins';
                this.render(gameId);
            };
        }

        if (winrateBtn) {
            winrateBtn.onclick = () => {
                this.filter = 'bestWinRate';
                this.render(gameId);
            };
        }
    }
}

export const leaderboardComponent = new LeaderboardComponent();
