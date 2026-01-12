import { db } from '../firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { router } from '../router.js';
import { formatTime, getCurrentUserId, getCurrentUserName } from '../utils/helpers.js';

class StatsComponent {
    constructor() {
        this.userStats = null;
        this.recentGames = [];
        this.loading = true;
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

    renderMiniSolvePath(solvePath) {
        if (!solvePath || solvePath.length === 0) return '<span style="color: #9ca3af; font-size: 0.75rem;">No path data</span>';
        
        return `
            <div style="display: flex; gap: 0.125rem; flex-wrap: wrap;">
                ${solvePath.map((guess, idx) => `
                    <div style="display: flex; gap: 1px; background: #e5e7eb; padding: 1px; border-radius: 2px;" title="Guess ${idx + 1}: ${guess.words.join(', ')}">
                        ${guess.words.map(word => {
                            // For mini view, we'll just use a simple color if we have difficulty data
                            const color = guess.difficulty ? this.getCategoryColor(guess.difficulty) : '#9ca3af';
                            return `<div style="width: 0.5rem; height: 0.5rem; background: ${color};"></div>`;
                        }).join('')}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    async load() {
        const userId = getCurrentUserId();
        const userName = getCurrentUserName();
        
        if (!userId) {
            this.loading = false;
            return false;
        }

        this.loading = true;
        
        try {
            const resultsRef = collection(db, "gameResults");
            const snapshot = await getDocs(resultsRef);
            
            let userResults = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.userId === userId) {
                    userResults.push(data);
                }
            });
            
            if (userResults.length === 0) {
                this.userStats = null;
                this.loading = false;
                return true;
            }

            // Sort by date (most recent first)
            userResults.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
            
            // Calculate stats
            const gamesPlayed = userResults.length;
            const gamesWon = userResults.filter(r => r.won).length;
            const winRate = Math.floor((gamesWon / gamesPlayed) * 100);
            
            const wonGames = userResults.filter(r => r.won);
            const bestTime = wonGames.length > 0 ? Math.min(...wonGames.map(r => r.timeSeconds)) : null;
            const avgTime = wonGames.length > 0 ? Math.floor(wonGames.reduce((sum, r) => sum + r.timeSeconds, 0) / wonGames.length) : null;
            
            const totalMistakes = userResults.reduce((sum, r) => sum + r.mistakes, 0);
            const avgMistakes = gamesPlayed > 0 ? (totalMistakes / gamesPlayed).toFixed(1) : 0;
            
            this.userStats = {
                userName,
                gamesPlayed,
                gamesWon,
                winRate,
                bestTime,
                avgTime,
                avgMistakes
            };
            
            this.recentGames = userResults.slice(0, 10);
            this.loading = false;
            return true;
            
        } catch (error) {
            console.error('Error loading stats:', error);
            this.loading = false;
            return false;
        }
    }

    render(gameId) {
        const app = document.getElementById('app');
        
        if (this.loading) {
            app.innerHTML = `
                <div class="container">
                    <div style="text-align: center; padding: 3rem;">
                        <p style="font-size: 1.25rem; color: #6b7280;">Loading stats...</p>
                    </div>
                </div>
            `;
            return;
        }

        if (!this.userStats) {
            app.innerHTML = `
                <div class="container">
                    <header>
                        <h1>📊 My Stats</h1>
                        <p class="subtitle">No games played yet!</p>
                    </header>
                    <div style="text-align: center; padding: 2rem; background: white; border-radius: 0.5rem; margin-top: 2rem;">
                        <p style="font-size: 4rem; margin-bottom: 1rem;">🎮</p>
                        <p style="color: #6b7280; margin-bottom: 1.5rem;">Start playing to see your stats here!</p>
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
            <div class="container" style="padding: 1rem;">
                <header>
                    <h1>📊 ${this.userStats.userName}'s Stats</h1>
                    <button class="nav-link" id="back-btn" style="margin-top: 0.5rem;">← Back to Game</button>
                </header>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                    ${this.renderStatCard('🎮', 'Games Played', this.userStats.gamesPlayed)}
                    ${this.renderStatCard('🏆', 'Games Won', this.userStats.gamesWon)}
                    ${this.renderStatCard('📈', 'Win Rate', `${this.userStats.winRate}%`)}
                    ${this.renderStatCard('⚡', 'Best Time', this.userStats.bestTime ? formatTime(this.userStats.bestTime) : 'N/A')}
                    ${this.renderStatCard('⏱️', 'Avg Time', this.userStats.avgTime ? formatTime(this.userStats.avgTime) : 'N/A')}
                    ${this.renderStatCard('❌', 'Avg Mistakes', this.userStats.avgMistakes)}
                </div>

                <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <h2 style="margin-bottom: 1rem;">Recent Games</h2>
                    ${this.renderRecentGames()}
                </div>

                <div style="text-align: center; margin-top: 2rem;">
                    <button class="nav-link" id="view-leaderboard-btn">🏆 View Leaderboard</button>
                </div>
            </div>
        `;

        this.attachListeners(gameId);
    }

    renderStatCard(icon, label, value) {
        return `
            <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">${icon}</div>
                <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.25rem;">${label}</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #1f2937;">${value}</div>
            </div>
        `;
    }

    renderRecentGames() {
        if (this.recentGames.length === 0) {
            return `<p style="color: #6b7280; text-align: center;">No games yet</p>`;
        }

        return `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                   <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            <th style="padding: 0.75rem; text-align: left; font-size: 0.875rem; color: #6b7280;">Date</th>
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Result</th>
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Time</th>
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Mistakes</th>
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Solve Path</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.recentGames.map(game => this.renderGameRow(game)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderGameRow(game) {
        const date = new Date(game.completedAt);
        const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        
        return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 0.75rem; font-size: 0.875rem;">
                    <div>${dateStr}</div>
                    <div style="color: #9ca3af; font-size: 0.75rem;">${timeStr}</div>
                </td>
                <td style="padding: 0.75rem; text-align: center;">
                    <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; ${game.won ? 'background: #dcfce7; color: #166534;' : 'background: #fee2e2; color: #991b1b;'}">
                        ${game.won ? '✅ Won' : '❌ Lost'}
                    </span>
                </td>
                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; font-weight: 600;">
                    ${game.won ? formatTime(game.timeSeconds) : '—'}
                </td>
                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; font-weight: 600;">
                    ${game.mistakes}/4
                </td>
                <td style="padding: 0.75rem; text-align: center;">
                    ${this.renderMiniSolvePath(game.solvePath)}
                </td>
            </tr>
        `;
    }
    attachListeners(gameId) {
        const backBtn = document.getElementById('back-btn');
        const leaderboardBtn = document.getElementById('view-leaderboard-btn');

        if (backBtn) {
            backBtn.onclick = () => {
                if (gameId) {
                    router.navigate('game', { id: gameId });
                } else {
                    history.back();
                }
            };
        }

        if (leaderboardBtn) {
            leaderboardBtn.onclick = () => {
                router.navigate('leaderboard', gameId ? { id: gameId } : {});
            };
        }
    }
}

export const statsComponent = new StatsComponent();
