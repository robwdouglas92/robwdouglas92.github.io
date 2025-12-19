import { db } from '../firebase.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { router } from '../router.js';
import { formatTime, getCurrentUserId, getCurrentUserName } from '../utils/helpers.js';

class StatsComponent {
    constructor() {
        this.userStats = null;
        this.recentGames = [];
        this.loading = true;
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
            const resultsRef = collection(db, "LizzieWordleResults");
            const q = query(resultsRef, where("userId", "==", userId));
            const snapshot = await getDocs(q);
            
            let userResults = [];
            snapshot.forEach(doc => {
                userResults.push(doc.data());
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
            
            // Calculate average guesses for wins
            const avgGuesses = wonGames.length > 0 ? (wonGames.reduce((sum, r) => sum + r.guessCount, 0) / wonGames.length).toFixed(1) : null;
            
            // Calculate streaks
            const { currentStreak, maxStreak } = this.calculateStreaks(userResults);
            
            // Calculate guess distribution (for wins only)
            const guessDistribution = this.calculateGuessDistribution(wonGames);
            
            this.userStats = {
                userName,
                gamesPlayed,
                gamesWon,
                winRate,
                bestTime,
                avgTime,
                avgGuesses,
                currentStreak,
                maxStreak,
                guessDistribution
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

    calculateStreaks(results) {
        // Sort by date (oldest first for streak calculation)
        const sorted = [...results].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
        
        let currentStreak = 0;
        let maxStreak = 0;
        let tempStreak = 0;
        
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].won) {
                tempStreak++;
                maxStreak = Math.max(maxStreak, tempStreak);
            } else {
                tempStreak = 0;
            }
        }
        
        // Current streak is from the end
        for (let i = sorted.length - 1; i >= 0; i--) {
            if (sorted[i].won) {
                currentStreak++;
            } else {
                break;
            }
        }
        
        return { currentStreak, maxStreak };
    }

    calculateGuessDistribution(wonGames) {
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        
        wonGames.forEach(game => {
            if (game.guessCount >= 1 && game.guessCount <= 6) {
                distribution[game.guessCount]++;
            }
        });
        
        return distribution;
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
                    <div style="margin-top: 1rem;">
                        <button class="nav-link" id="back-btn">← Back to Game</button>
                        <button class="nav-link" id="view-leaderboard-btn">🏆 Leaderboard</button>
                    </div>
                </header>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                    ${this.renderStatCard('🎮', 'Played', this.userStats.gamesPlayed)}
                    ${this.renderStatCard('🏆', 'Win Rate', `${this.userStats.winRate}%`)}
                    ${this.renderStatCard('🔥', 'Current Streak', this.userStats.currentStreak)}
                    ${this.renderStatCard('⭐', 'Max Streak', this.userStats.maxStreak)}
                    ${this.renderStatCard('🎯', 'Avg Guesses', this.userStats.avgGuesses || 'N/A')}
                    ${this.renderStatCard('⚡', 'Best Time', this.userStats.bestTime ? formatTime(this.userStats.bestTime) : 'N/A')}
                </div>

                ${this.renderGuessDistribution()}

                <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-top: 2rem;">
                    <h2 style="margin-bottom: 1rem;">Recent Games</h2>
                    ${this.renderRecentGames()}
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

    renderGuessDistribution() {
        const distribution = this.userStats.guessDistribution;
        const maxCount = Math.max(...Object.values(distribution), 1);
        
        return `
            <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin-bottom: 1rem;">Guess Distribution</h2>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${Object.entries(distribution).map(([guesses, count]) => {
                        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                        return `
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span style="min-width: 1rem; font-weight: 600; color: #6b7280;">${guesses}</span>
                                <div style="flex: 1; background: #e5e7eb; border-radius: 0.25rem; height: 2rem; position: relative; overflow: hidden;">
                                    <div style="background: ${count > 0 ? '#6aaa64' : '#e5e7eb'}; height: 100%; width: ${percentage}%; display: flex; align-items: center; justify-content: flex-end; padding-right: 0.5rem; transition: width 0.3s;">
                                        ${count > 0 ? `<span style="color: white; font-weight: bold; font-size: 0.875rem;">${count}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <p style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.75rem; text-align: center;">
                    Distribution shows wins only
                </p>
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
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Word</th>
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Result</th>
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Guesses</th>
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Time</th>
                            <th style="padding: 0.75rem; text-align: center; font-size: 0.875rem; color: #6b7280;">Path</th>
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
                    <span style="font-weight: bold; font-size: 0.875rem; font-family: monospace;">${game.targetWord}</span>
                </td>
                <td style="padding: 0.75rem; text-align: center;">
                    <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; ${game.won ? 'background: #dcfce7; color: #166534;' : 'background: #fee2e2; color: #991b1b;'}">
                        ${game.won ? '✅ Won' : '❌ Lost'}
                    </span>
                </td>
                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; font-weight: 600;">
                    ${game.guessCount}/6
                </td>
                <td style="padding: 0.75rem; text-align: center; font-size: 0.875rem; font-weight: 600;">
                    ${game.won ? formatTime(game.timeSeconds) : '—'}
                </td>
                <td style="padding: 0.75rem; text-align: center;">
                    ${this.renderMiniSolvePath(game.solvePath)}
                </td>
            </tr>
        `;
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
