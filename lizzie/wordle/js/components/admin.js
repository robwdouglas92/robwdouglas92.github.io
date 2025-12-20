import { db, auth } from '../firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { router } from '../router.js';
import { isValidWord } from '../utils/wordValidation.js';

class AdminComponent {
    constructor() {
        this.isAuthenticated = false;
        this.showPasswordPrompt = true;
        this.passwordInput = '';
        this.message = '';
        this.messageType = '';
        this.targetWord = '';
        this.isValidating = false;
        this.wordIsValid = null;
        this.lastGeneratedLink = '';
        this.createdBy = 'Rob'; // Default to Rob
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

    updateTargetWord(value) {
        this.targetWord = value.toUpperCase();
        this.wordIsValid = null; // Reset validation when word changes
    }

    async validateWord() {
        const word = this.targetWord.trim();
        
        if (!word) {
            this.message = 'Please enter a word';
            this.messageType = 'error';
            this.render();
            setTimeout(() => {
                this.message = '';
                this.render();
            }, 2000);
            return;
        }

        if (word.length !== 5) {
            this.message = 'Word must be exactly 5 letters';
            this.messageType = 'error';
            this.wordIsValid = false;
            this.render();
            setTimeout(() => {
                this.message = '';
                this.render();
            }, 2000);
            return;
        }

        this.isValidating = true;
        this.message = 'Validating word...';
        this.messageType = 'info';
        this.render();

        const valid = await isValidWord(word);
        this.isValidating = false;

        if (valid) {
            this.wordIsValid = true;
            this.message = '✅ Valid word!';
            this.messageType = 'success';
        } else {
            this.wordIsValid = false;
            this.message = '❌ Not a valid English word';
            this.messageType = 'error';
        }

        this.render();
        setTimeout(() => {
            if (this.wordIsValid) {
                this.message = '';
                this.render();
            }
        }, 2000);
    }

    async saveGame() {
        const word = this.targetWord.trim().toUpperCase();

        if (!word) {
            this.message = 'Please enter a word';
            this.messageType = 'error';
            this.render();
            return;
        }

        if (word.length !== 5) {
            this.message = 'Word must be exactly 5 letters';
            this.messageType = 'error';
            this.render();
            return;
        }

        if (this.wordIsValid === false) {
            this.message = 'Please validate the word first';
            this.messageType = 'error';
            this.render();
            return;
        }

        // If not validated yet, validate now
        if (this.wordIsValid === null) {
            await this.validateWord();
            if (!this.wordIsValid) {
                return;
            }
        }

        const gameDataToSave = {
            targetWord: word,
            createdAt: new Date().toISOString(),
            createdBy: this.createdBy  // Use the dropdown selection
        };

        try {
            const id = Math.random().toString(36).substring(2, 8);
            const gameRef = doc(db, "LizzieWordleGames", id);  // Correct collection name
            await setDoc(gameRef, gameDataToSave);

            const shareUrl = `${window.location.origin}${window.location.pathname}?id=${id}`;
            this.lastGeneratedLink = shareUrl;
            this.message = `✅ Game saved! Link: ${shareUrl}`;
            this.messageType = 'success';
            console.log('Wordle game saved with ID:', id, 'by', this.createdBy);
            
            // Reset form
            this.targetWord = '';
            this.wordIsValid = null;
            
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

    copyLink() {
        if (this.lastGeneratedLink) {
            navigator.clipboard.writeText(this.lastGeneratedLink).then(() => {
                this.message = '✅ Link copied to clipboard!';
                this.messageType = 'success';
                this.render();
                setTimeout(() => {
                    this.message = `✅ Game saved! Link: ${this.lastGeneratedLink}`;
                    this.render();
                }, 1500);
            });
        }
    }

    clearForm() {
        if (confirm('Clear the form?')) {
            this.targetWord = '';
            this.wordIsValid = null;
            this.message = '';
            this.lastGeneratedLink = '';
            this.render();
        }
    }

    fillExample() {
        this.targetWord = 'HOUSE';
        this.wordIsValid = null;
        this.message = 'Example loaded! Validate and save when ready.';
        this.messageType = 'success';
        this.render();
        setTimeout(() => {
            this.message = '';
            this.render();
        }, 2000);
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
                        <input type="password" id="password-input" class="input" placeholder="Password" autocomplete="current-password">
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
                <div class="container">
                    <header style="text-align: center; margin-bottom: 2rem; color: white;">
                        <h1 style="font-size: 2.25rem; font-weight: bold; margin-bottom: 0.5rem;">🎮 Wordle Admin</h1>
                        <p style="color: #d1d5db;">Create custom Wordle puzzles</p>
                        <button class="nav-link" id="exit-admin" style="margin-top: 0.75rem; color: white; background: rgba(255,255,255,0.2); border: none;">✕ Exit Admin Mode</button>
                    </header>

                    ${this.message ? `<div class="message msg-${this.messageType}" style="margin-bottom: 1.5rem;">${this.message}</div>` : ''}

                    ${this.lastGeneratedLink ? `
                        <div style="background: #10b981; color: white; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <p style="font-weight: bold; margin-bottom: 0.5rem;">🎉 Last Generated Link:</p>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <input 
                                    type="text" 
                                    readonly 
                                    value="${this.lastGeneratedLink}"
                                    style="flex: 1; padding: 0.5rem; border: none; border-radius: 0.25rem; font-size: 0.875rem;"
                                    id="generated-link-input"
                                >
                                <button class="btn btn-secondary" id="copy-link-btn" style="background: white; color: #10b981; border: none; padding: 0.5rem 1rem;">
                                    📋 Copy
                                </button>
                            </div>
                        </div>
                    ` : ''}

                    <div style="background: white; border-radius: 0.5rem; padding: 2rem; margin-bottom: 1.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <h2 style="margin-bottom: 1.5rem; font-size: 1.5rem;">Create New Game</h2>

                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem;">
                                Created By
                            </label>
                            <select id="creator-select" class="input" style="margin-bottom: 1.5rem;">
                                <option value="Rob" ${this.createdBy === 'Rob' ? 'selected' : ''}>Rob</option>
                                <option value="Lizzie" ${this.createdBy === 'Lizzie' ? 'selected' : ''}>Lizzie</option>
                            </select>
                        </div>

                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem;">
                                Target Word (5 letters)
                            </label>
                            <input 
                                type="text" 
                                id="target-word-input" 
                                class="input" 
                                value="${this.targetWord}" 
                                placeholder="Enter a 5-letter word"
                                maxlength="5"
                                autocomplete="off"
                                style="text-transform: uppercase; font-size: 1.25rem; font-weight: bold; letter-spacing: 0.1em; ${this.wordIsValid === true ? 'border-color: #22c55e;' : this.wordIsValid === false ? 'border-color: #ef4444;' : ''}"
                            >
                            ${this.wordIsValid === true ? `
                                <p style="color: #22c55e; font-size: 0.875rem; margin-top: 0.25rem;">✓ Valid word</p>
                            ` : this.wordIsValid === false ? `
                                <p style="color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem;">✗ Invalid word</p>
                            ` : ''}
                        </div>

                        ${this.renderPreview()}

                        <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; flex-wrap: wrap;">
                            <button class="btn btn-primary" id="validate-btn" ${this.isValidating ? 'disabled' : ''} style="background: #3b82f6;">
                                ${this.isValidating ? '⏳ Validating...' : '✓ Validate Word'}
                            </button>
                            <button class="btn btn-secondary" id="load-example" style="background: #8b5cf6; color: white; border: none;">👁 Load Example</button>
                            <button class="btn btn-secondary" id="clear-btn" style="background: #ef4444; color: white; border: none;">🗑 Clear</button>
                        </div>
                    </div>

                    <div style="text-align: center; margin-bottom: 2rem;">
                        <button class="btn btn-primary" id="save-game" ${!this.wordIsValid || this.isValidating ? 'disabled' : ''} style="background: #10b981; padding: 1rem 2rem; font-size: 1.125rem;">
                            💾 Save Game
                        </button>
                    </div>

                    <div style="background: rgba(255,255,255,0.1); border-radius: 0.5rem; padding: 1.5rem; color: white;">
                        <h3 style="font-weight: bold; font-size: 1.125rem; margin-bottom: 0.75rem;">💡 Tips:</h3>
                        <ul style="font-size: 0.875rem; color: #e5e7eb; list-style-position: inside; line-height: 1.6;">
                            <li>• Enter a 5-letter English word</li>
                            <li>• Click "Validate Word" to check if it's in the dictionary</li>
                            <li>• Once validated, click "Save Game" to create the puzzle</li>
                            <li>• You'll get a shareable link to send to players</li>
                            <li>• Players can guess the same word multiple times</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        this.attachAdminListeners();
    }

    renderPreview() {
        if (!this.targetWord || this.targetWord.length !== 5) {
            return '';
        }

        return `
            <div style="margin: 1.5rem 0; padding: 1.5rem; background: #f9fafb; border-radius: 0.5rem; border: 2px dashed #d1d5db;">
                <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #374151;">Preview:</h3>
                <div style="display: flex; gap: 0.375rem; justify-content: center;">
                    ${this.targetWord.split('').map(letter => `
                        <div style="
                            width: 50px;
                            height: 50px;
                            border: 2px solid #d1d5db;
                            background: white;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 1.5rem;
                            font-weight: bold;
                            border-radius: 0.25rem;
                        ">
                            ${letter}
                        </div>
                    `).join('')}
                </div>
                <p style="text-align: center; color: #6b7280; font-size: 0.875rem; margin-top: 1rem;">
                    This is what players will try to guess
                </p>
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
        const validateBtn = document.getElementById('validate-btn');
        const loadExampleBtn = document.getElementById('load-example');
        const clearBtn = document.getElementById('clear-btn');
        const saveBtn = document.getElementById('save-game');
        const copyLinkBtn = document.getElementById('copy-link-btn');
        const input = document.getElementById('target-word-input');
        const creatorSelect = document.getElementById('creator-select');
        
        if (exitBtn) exitBtn.onclick = () => router.navigate('game', {});
        if (validateBtn) validateBtn.onclick = () => this.validateWord();
        if (loadExampleBtn) loadExampleBtn.onclick = () => this.fillExample();
        if (clearBtn) clearBtn.onclick = () => this.clearForm();
        if (saveBtn) saveBtn.onclick = () => this.saveGame();
        if (copyLinkBtn) copyLinkBtn.onclick = () => this.copyLink();
        
        if (creatorSelect) {
            creatorSelect.onchange = (e) => {
                this.createdBy = e.target.value;
            };
        }
        
        if (input) {
            input.focus();
            input.oninput = (e) => {
                // Store cursor position
                const cursorPos = e.target.selectionStart;
                const oldLength = this.targetWord.length;
                
                this.updateTargetWord(e.target.value);
                this.render();
                
                // Restore cursor position after render
                setTimeout(() => {
                    const newInput = document.getElementById('target-word-input');
                    if (newInput) {
                        const newLength = this.targetWord.length;
                        const newCursorPos = cursorPos + (newLength - oldLength);
                        newInput.setSelectionRange(newCursorPos, newCursorPos);
                        newInput.focus();
                    }
                }, 0);
            };
        }
    }
}

export const adminComponent = new AdminComponent();
