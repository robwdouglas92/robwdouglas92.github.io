import { db, auth } from '../firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { router } from '../router.js';

class AdminComponent {
    constructor() {
        this.isAuthenticated = false;
        this.showPasswordPrompt = true;
        this.passwordInput = '';
        this.message = '';
        this.messageType = '';
        this.categories = [
            { title: '', words: ['', '', '', ''], difficulty: 'easy' },
            { title: '', words: ['', '', '', ''], difficulty: 'medium' },
            { title: '', words: ['', '', '', ''], difficulty: 'hard' },
            { title: '', words: ['', '', '', ''], difficulty: 'tricky' }
        ];
    }

    async checkAuth() {
        // Check if already signed in
        this.isAuthenticated = auth.currentUser !== null;
        this.showPasswordPrompt = !this.isAuthenticated;
        return this.isAuthenticated;
    }

    async handlePasswordSubmit() {
        try {
            await signInWithEmailAndPassword(auth, 'admin@robwdouglas92.com', this.passwordInput);
            this.isAuthenticated = true;
            this.showPasswordPrompt = false;
            this.passwordInput = '';
            this.message = '';
            this.render();
        } catch (error) {
            this.message = '❌ Incorrect password!';
            this.messageType = 'error';
            this.passwordInput = '';
            this.render();
            setTimeout(() => {
                this.message = '';
                this.render();
            }, 2000);
        }
    }

    handlePasswordCancel() {
        router.navigate('game', {});
    }

    updateCategoryTitle(index, value) {
        this.categories[index].title = value;
    }

    updateWord(categoryIndex, wordIndex, value) {
        this.categories[categoryIndex].words[wordIndex] = value;
    }

    updateDifficulty(index, value) {
        this.categories[index].difficulty = value;
        this.render();
    }

    validateGame() {
        for (let i = 0; i < this.categories.length; i++) {
            const cat = this.categories[i];
            if (!cat.title.trim()) {
                return `Category ${i + 1} needs a title`;
            }
            for (let j = 0; j < cat.words.length; j++) {
                if (!cat.words[j].trim()) {
                    return `Category ${i + 1} is missing word ${j + 1}`;
                }
            }
        }
        
        const allWords = this.categories.flatMap(cat => cat.words.map(w => w.trim().toLowerCase()));
        const uniqueWords = new Set(allWords);
        if (uniqueWords.size !== allWords.length) {
            return 'All words must be unique (no duplicates)';
        }
        
        return null;
    }

    async saveGame() {
        const error = this.validateGame();
        if (error) {
            this.message = `Error: ${error}`;
            this.messageType = 'error';
            this.render();
            setTimeout(() => {
                this.message = '';
                this.render();
            }, 4000);
            return;
        }

        const gameDataToSave = {
            categories: this.categories.map(cat => ({
                ...cat,
                title: cat.title.trim(),
                words: cat.words.map(w => w.trim())
            })),
            createdAt: new Date().toISOString()
            createdBy: auth.currentUser.email === 'admin@robwdouglas92.com' ? 'Rob' : 'Lizzie'
        };

        try {
            const id = Math.random().toString(36).substring(2, 8);
            const gameRef = doc(db, "LizzieConnectionGames", id);
            await setDoc(gameRef, gameDataToSave);

            const shareUrl = `${window.location.origin}${window.location.pathname}?id=${id}`;
            this.message = `✅ Game saved! Share this link:\n${shareUrl}`;
            this.messageType = 'success';
            console.log('Saved with ID:', id);
            this.render();
            
            setTimeout(() => {
                alert(`Game saved! Share this link:\n\n${shareUrl}`);
            }, 100);
        } catch (err) {
            console.error("Error saving:", err);
            this.message = `❌ Error: ${err.message}`;
            this.messageType = "error";
            this.render();
        }
    }

    clearAll() {
        if (confirm('Are you sure you want to clear all categories?')) {
            this.categories = [
                { title: '', words: ['', '', '', ''], difficulty: 'easy' },
                { title: '', words: ['', '', '', ''], difficulty: 'medium' },
                { title: '', words: ['', '', '', ''], difficulty: 'hard' },
                { title: '', words: ['', '', '', ''], difficulty: 'tricky' }
            ];
            this.message = 'All fields cleared';
            this.messageType = 'info';
            this.render();
            setTimeout(() => {
                this.message = '';
                this.render();
            }, 2000);
        }
    }

    fillExample() {
        this.categories = [
            {
                title: 'Christmas Movies',
                words: ['Elf', 'Home Alone', 'The Grinch', 'Miracle'],
                difficulty: 'easy'
            },
            {
                title: 'Winter Activities',
                words: ['Skiing', 'Sledding', 'Ice Skating', 'Snowboarding'],
                difficulty: 'medium'
            },
            {
                title: 'Holiday Foods',
                words: ['Turkey', 'Ham', 'Stuffing', 'Cranberry'],
                difficulty: 'hard'
            },
            {
                title: 'Words with Snow',
                words: ['Snowman', 'Snowflake', 'Snowball', 'Snowstorm'],
                difficulty: 'tricky'
            }
        ];
        this.message = 'Example loaded! Edit and save when ready.';
        this.messageType = 'success';
        this.render();
        setTimeout(() => {
            this.message = '';
            this.render();
        }, 3000);
    }

    render() {
        const app = document.getElementById('app');

        if (this.showPasswordPrompt) {
            app.innerHTML = `
                <div class="modal">
                    <div class="modal-content">
                        <h2 class="modal-title">Admin Access</h2>
                        <p style="color: #4b5563; margin-bottom: 1rem;">Enter the admin password:</p>
                        ${this.message ? `<div class="message msg-${this.messageType}">${this.message}</div>` : ''}
                        <input type="password" id="password-input" class="input" placeholder="Password">
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-primary" id="submit-password" style="flex: 1;">Submit</button>
                            <button class="btn btn-secondary" id="cancel-password" style="flex: 1;">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            
            this.attachPasswordListeners();
            return;
        }

        app.innerHTML = `
            <div style="min-height: 100vh; background: linear-gradient(to bottom right, #0f172a, #581c87, #0f172a); padding: 1rem;">
                <div class="wide-container">
                    <header style="text-align: center; margin-bottom: 2rem; color: white;">
                        <h1 style="font-size: 2.25rem; font-weight: bold; margin-bottom: 0.5rem;">🎮 Admin Mode</h1>
                        <p style="color: #d1d5db;">Create and manage your family's game</p>
                        <button class="nav-link" id="exit-admin" style="margin-top: 0.75rem; color: white; background: rgba(255,255,255,0.2); border: none;">✕ Exit Admin Mode</button>
                    </header>

                    ${this.message ? `<div class="message msg-${this.messageType}" style="margin-bottom: 1.5rem;">${this.message}</div>` : ''}

                    <div style="background: white; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1.5rem;">
                        <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
                            <button class="btn btn-primary" id="load-example" style="background: #3b82f6; border-radius: 0.5rem;">👁 Load Example</button>
                            <button class="btn btn-secondary" id="clear-all" style="background: #ef4444; color: white; border: none; border-radius: 0.5rem;">🗑 Clear All</button>
                        </div>

                        ${this.categories.map((cat, idx) => this.renderCategoryEditor(cat, idx)).join('')}
                    </div>

                    <div style="text-align: center; margin-bottom: 2rem;">
                        <button class="btn btn-primary" id="save-game" style="background: #10b981; padding: 1rem 2rem; font-size: 1.125rem; border-radius: 0.5rem;">💾 Save Game</button>
                    </div>

                    <div style="background: rgba(255,255,255,0.1); border-radius: 0.5rem; padding: 1.5rem; color: white;">
                        <h3 style="font-weight: bold; font-size: 1.125rem; margin-bottom: 0.5rem;">💡 Tips:</h3>
                        <ul style="font-size: 0.875rem; color: #e5e7eb; list-style-position: inside;">
                            <li>• Each category needs a title and 4 unique words</li>
                            <li>• Easy (yellow) should be the most obvious category</li>
                            <li>• Tricky (purple) should be the hardest to figure out</li>
                            <li>• All 16 words must be unique across all categories</li>
                            <li>• After saving, you'll get a link to share with players!</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        this.attachAdminListeners();
    }

    renderCategoryEditor(cat, idx) {
        const borderColors = {
            easy: 'border-color: #facc15; background: #fefce8;',
            medium: 'border-color: #22c55e; background: #f0fdf4;',
            hard: 'border-color: #3b82f6; background: #eff6ff;',
            tricky: 'border-color: #9333ea; background: #faf5ff;'
        };

        return `
            <div style="border-left: 4px solid; padding: 1rem; border-radius: 0 0.5rem 0.5rem 0; margin-bottom: 1.5rem; ${borderColors[cat.difficulty]}">
                <div style="margin-bottom: 0.75rem;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem;">
                        Category ${idx + 1} Title
                    </label>
                    <input type="text" class="input cat-title" data-idx="${idx}" value="${cat.title}" placeholder="e.g., Types of Fruit">
                </div>

                <div style="margin-bottom: 0.75rem;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem;">
                        Difficulty
                    </label>
                    <select class="cat-difficulty" data-idx="${idx}" style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem;">
                        <option value="easy" ${cat.difficulty === 'easy' ? 'selected' : ''}>Easy (Yellow)</option>
                        <option value="medium" ${cat.difficulty === 'medium' ? 'selected' : ''}>Medium (Green)</option>
                        <option value="hard" ${cat.difficulty === 'hard' ? 'selected' : ''}>Hard (Blue)</option>
                        <option value="tricky" ${cat.difficulty === 'tricky' ? 'selected' : ''}>Tricky (Purple)</option>
                    </select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    ${cat.words.map((word, wordIdx) => `
                        <input type="text" class="input cat-word" data-idx="${idx}" data-word="${wordIdx}" value="${word}" placeholder="Word ${wordIdx + 1}">
                    `).join('')}
                </div>
            </div>
        `;
    }

    attachPasswordListeners() {
        const submitBtn = document.getElementById('submit-password');
        const cancelBtn = document.getElementById('cancel-password');
        const input = document.getElementById('password-input');
        
        if (submitBtn) submitBtn.onclick = () => this.handlePasswordSubmit();
        if (cancelBtn) cancelBtn.onclick = () => this.handlePasswordCancel();
        if (input) {
            input.focus();
            input.oninput = (e) => this.passwordInput = e.target.value;
            input.onkeypress = (e) => {
                if (e.key === 'Enter') this.handlePasswordSubmit();
            };
        }
    }

    attachAdminListeners() {
        const exitBtn = document.getElementById('exit-admin');
        const loadExampleBtn = document.getElementById('load-example');
        const clearBtn = document.getElementById('clear-all');
        const saveBtn = document.getElementById('save-game');
        
        if (exitBtn) exitBtn.onclick = () => router.navigate('game', {});
        if (loadExampleBtn) loadExampleBtn.onclick = () => this.fillExample();
        if (clearBtn) clearBtn.onclick = () => this.clearAll();
        if (saveBtn) saveBtn.onclick = () => this.saveGame();
        
        document.querySelectorAll('.cat-title').forEach(input => {
            input.oninput = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                this.updateCategoryTitle(idx, e.target.value);
            };
        });
        
        document.querySelectorAll('.cat-difficulty').forEach(select => {
            select.onchange = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                this.updateDifficulty(idx, e.target.value);
            };
        });
        
        document.querySelectorAll('.cat-word').forEach(input => {
            input.oninput = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const wordIdx = parseInt(e.target.dataset.word);
                this.updateWord(idx, wordIdx, e.target.value);
            };
        });
    }
}

export const adminComponent = new AdminComponent();
