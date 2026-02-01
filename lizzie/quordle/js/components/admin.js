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
        this.targetWords = ['', '', '', ''];
        this.isValidating = false;
        this.wordsValid = [null, null, null, null];
        this.lastGeneratedLink = '';
        this.createdBy = 'Rob'; // Default to Rob
    }

    async checkAuth() {
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

    updateTargetWord(index, value) {
        this.targetWords[index] = value.toUpperCase();
        this.wordsValid[index] = null; // Reset validation when word changes
    }

    async validateWord(index) {
        const word = this.targetWords[index].trim();
        
        if (!word) {
            this.message = `Please enter word ${index + 1}`;
            this.messageType = 'error';
            this.render();
            setTimeout(() => {
                this.message = '';
                this.render();
            }, 2000);
            return;
        }

        if (word.length !== 5) {
            this.message = `Word ${index + 1} must be exactly 5 letters`;
            this.messageType = 'error';
            this.wordsValid[index] = false;
            this.render();
            setTimeout(() => {
                this.message = '';
                this.render();
            }, 2000);
            return;
        }

        this.isValidating = true;
        this.message = `Validating word ${index + 1}...`;
        this.messageType = 'info';
        this.render();

        const valid = await isValidWord(word);
        this.isValidating = false;

        if (valid) {
            this.wordsValid[index] = true;
            this.message = `✅ Word ${index + 1} is valid!`;
            this.messageType = 'success';
        } else {
            this.wordsValid[index] = false;
            this.message = `❌ Word ${index + 1} is not a valid English word`;
            this.messageType = 'error';
        }

        this.render();
        setTimeout(() => {
            if (this.wordsValid[index]) {
                this.message = '';
                this.render();
            }
        }, 2000);
    }

    async validateAllWords() {
        // Check all words are 5 letters
        for (let i = 0; i < 4; i++) {
            const word = this.targetWords[i].trim();
            if (!word || word.length !== 5) {
                this.message = `All words must be exactly 5 letters`;
                this.messageType = 'error';
                this.render();
                return;
            }
        }

        this.isValidating = true;
        this.message = 'Validating all words...';
        this.messageType = 'info';
        this.render();

        // Validate all words
        for (let i = 0; i < 4; i++) {
            const valid = await isValidWord(this.targetWords[i]);
            this.wordsValid[i] = valid;
            if (!valid) {
                this.isValidating = false;
                this.message = `❌ Word ${i + 1} (${this.targetWords[i]}) is not valid`;
                this.messageType = 'error';
                this.render();
                return;
            }
        }

        this.isValidating = false;
        this.message = '✅ All words are valid!';
        this.messageType = 'success';
        this.render();
        setTimeout(() => {
            this.message = '';
            this.render();
        }, 2000);
    }

    async saveGame() {
        // Check all words exist and are 5 letters
        for (let i = 0; i < 4; i++) {
            const word = this.targetWords[i].trim().toUpperCase();
            if (!word) {
                this.message = `Please enter word ${i + 1}`;
                this.messageType = 'error';
                this.render();
                return;
            }
            if (word.length !== 5) {
                this.message = `Word ${i + 1} must be exactly 5 letters`;
                this.messageType = 'error';
                this.render();
                return;
            }
            if (this.wordsValid[i] === false) {
                this.message = `Please validate word ${i + 1} first`;
                this.messageType = 'error';
                this.render();
                return;
            }
        }

        // If any words haven't been validated yet, validate them all now
        if (this.wordsValid.some(v => v === null)) {
            await this.validateAllWords();
            if (this.wordsValid.some(v => !v)) {
                return; // Validation failed
            }
        }

        // Check for duplicate words
        const words = this.targetWords.map(w => w.trim().toUpperCase());
        const uniqueWords = new Set(words);
        if (uniqueWords.size !== 4) {
            this.message = '❌ All 4 words must be different';
            this.messageType = 'error';
            this.render();
            return;
        }

        const gameDataToSave = {
            targetWords: words,
            createdAt: new Date().toISOString(),
            createdBy: this.createdBy
        };

        try {
            const id = Math.random().toString(36).substring(2, 8);
            const gameRef = doc(db, "LizzieQuordleGames", id);
            await setDoc(gameRef, gameDataToSave);

            const shareUrl = `${window.location.origin}${window.location.pathname}?id=${id}`;
            this.lastGeneratedLink = shareUrl;
            this.message = `✅ Game saved! Link: ${shareUrl}`;
            this.messageType = 'success';
            console.log('Quordle game saved with ID:', id, 'by', this.createdBy);
            
            // Reset form
            this.targetWords = ['', '', '', ''];
            this.wordsValid = [null, null, null, null];
            
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
        if (confirm('Clear all words?')) {
            this.targetWords = ['', '', '', ''];
            this.wordsValid = [null, null, null, null];
            this.message = '';
            this.lastGeneratedLink = '';
            this.render();
        }
    }

    fillExample() {
        this.targetWords = ['HOUSE', 'APPLE', 'TRAIN', 'CLOUD'];
        this.wordsValid = [null, null, null, null];
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
                <div class="container" style="max-width: 800px;">
                    <header style="text-align: center; margin-bottom: 2rem; color: white;">
                        <h1 style="font-size: 2.25rem; font-weight: bold; margin-bottom: 0.5rem;">🎮 Quordle Admin</h1>
                        <p style="color: #d1d5db;">Create custom Quordle puzzles</p>
                        <button class="nav-link" id="back-home" style="margin-top: 0.75rem; color: white; background: rgba(255,255,255,0.2); border: none;">🏠 Back to Home</button>
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

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                            ${this.targetWords.map((word, idx) => this.renderWordInput(word, idx)).join('')}
                        </div>

                        ${this.renderPreview()}

                        <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; flex-wrap: wrap;">
                            <button class="btn btn-primary" id="validate-all-btn" ${this.isValidating ? 'disabled' : ''} style="background: #3b82f6;">
                                ${this.isValidating ? '⏳ Validating...' : '✓ Validate All Words'}
                            </button>
                            <button class="btn btn-secondary" id="load-example" style="background: #8b5cf6; color: white; border: none;">👁 Load Example</button>
                            <button class="btn btn-secondary" id="clear-btn" style="background: #ef4444; color: white; border: none;">🗑 Clear</button>
                        </div>
                    </div>

                    <div style="text-align: center; margin-bottom: 2rem;">
                        <button class="btn btn-primary" id="save-game" ${!this.wordsValid.every(v => v === true) || this.isValidating ? 'disabled' : ''} style="background: #10b981; padding: 1rem 2rem; font-size: 1.125rem;">
                            💾 Save Game
                        </button>
                    </div>

                    <div style="background: rgba(255,255,255,0.1); border-radius: 0.5rem; padding: 1.5rem; color: white;">
                        <h3 style="font-weight: bold; font-size: 1.125rem; margin-bottom: 0.75rem;">💡 Tips:</h3>
                        <ul style="font-size: 0.875rem; color: #e5e7eb; list-style-position: inside; line-height: 1.6;">
                            <li>• Enter 4 different 5-letter English words</li>
                            <li>• Click "Validate All Words" to check the dictionary</li>
                            <li>• All 4 words must be unique (no duplicates)</li>
                            <li>• Once validated, click "Save Game" to create the puzzle</li>
                            <li>• You'll get a shareable link to send to players</li>
                            <li>• Players have 9 guesses to solve all 4 words</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        this.attachAdminListeners();
    }

    renderWordInput(word, idx) {
        const validationState = this.wordsValid[idx];
        let borderColor = '#d1d5db';
        let statusIcon = '';
        
        if (validationState === true) {
            borderColor = '#22c55e';
            statusIcon = '<span style="color: #22c55e;">✓</span>';
        } else if (validationState === false) {
            borderColor = '#ef4444';
            statusIcon = '<span style="color: #ef4444;">✗</span>';
        }

        return `
            <div>
                <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem;">
                    Word ${idx + 1} ${statusIcon}
                </label>
                <input 
                    type="text" 
                    id="word-input-${idx}" 
                    class="input word-input" 
                    data-idx="${idx}"
                    value="${word}" 
                    placeholder="5 letters"
                    maxlength="5"
                    autocomplete="off"
                    style="text-transform: uppercase; font-size: 1.125rem; font-weight: bold; letter-spacing: 0.1em; border-color: ${borderColor}; margin-bottom: 0.5rem;"
                >
                <button class="btn btn-secondary" id="validate-${idx}" style="width: 100%; font-size: 0.75rem; padding: 0.5rem;">
                    Validate
                </button>
            </div>
        `;
    }

    updateWordInputUI(idx) {
        // Update the input value to uppercase without re-rendering
        const input = document.getElementById(`word-input-${idx}`);
        if (input) {
            const cursorPos = input.selectionStart;
            input.value = this.targetWords[idx];
            input.setSelectionRange(cursorPos, cursorPos);
        }

        // Update validation indicator on the label
        const label = input?.closest('div')?.querySelector('label');
        if (label) {
            const validationState = this.wordsValid[idx];
            let statusIcon = '';
            if (validationState === true) statusIcon = ' <span style="color: #22c55e;">✓</span>';
            else if (validationState === false) statusIcon = ' <span style="color: #ef4444;">✗</span>';
            label.innerHTML = `Word ${idx + 1}${statusIcon}`;
        }

        // Update input border color
        if (input) {
            const validationState = this.wordsValid[idx];
            if (validationState === true) input.style.borderColor = '#22c55e';
            else if (validationState === false) input.style.borderColor = '#ef4444';
            else input.style.borderColor = '#d1d5db';
        }

        // Update or remove the preview section without full re-render
        this.updatePreview();
    }

    updatePreview() {
        const allFilled = this.targetWords.every(w => w.length === 5);
        let preview = document.querySelector('.preview-section');

        if (!allFilled) {
            if (preview) preview.remove();
            return;
        }

        const previewHTML = `
            <div class="preview-section" style="margin: 1.5rem 0; padding: 1.5rem; background: #f9fafb; border-radius: 0.5rem; border: 2px dashed #d1d5db;">
                <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #374151;">Preview:</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    ${this.targetWords.map(word => `
                        <div style="display: flex; gap: 0.25rem; justify-content: center;">
                            ${word.split('').map(letter => `
                                <div style="
                                    width: 30px;
                                    height: 30px;
                                    border: 2px solid #d1d5db;
                                    background: white;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-size: 1rem;
                                    font-weight: bold;
                                    border-radius: 0.25rem;
                                ">
                                    ${letter}
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
                <p style="text-align: center; color: #6b7280; font-size: 0.875rem; margin-top: 1rem;">
                    These are the 4 words players will try to guess
                </p>
            </div>
        `;

        if (preview) {
            preview.outerHTML = previewHTML;
        } else {
            // Insert preview before the button row
            const buttonRow = document.querySelector('#validate-all-btn')?.closest('div');
            if (buttonRow) buttonRow.insertAdjacentHTML('beforebegin', previewHTML);
        }
    }
        const allFilled = this.targetWords.every(w => w.length === 5);
        if (!allFilled) return '';

        return `
            <div style="margin: 1.5rem 0; padding: 1.5rem; background: #f9fafb; border-radius: 0.5rem; border: 2px dashed #d1d5db;">
                <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #374151;">Preview:</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    ${this.targetWords.map(word => `
                        <div style="display: flex; gap: 0.25rem; justify-content: center;">
                            ${word.split('').map(letter => `
                                <div style="
                                    width: 30px;
                                    height: 30px;
                                    border: 2px solid #d1d5db;
                                    background: white;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-size: 1rem;
                                    font-weight: bold;
                                    border-radius: 0.25rem;
                                ">
                                    ${letter}
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
                <p style="text-align: center; color: #6b7280; font-size: 0.875rem; margin-top: 1rem;">
                    These are the 4 words players will try to guess
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
        const backHomeBtn = document.getElementById('back-home');
        const validateAllBtn = document.getElementById('validate-all-btn');
        const loadExampleBtn = document.getElementById('load-example');
        const clearBtn = document.getElementById('clear-btn');
        const saveBtn = document.getElementById('save-game');
        const copyLinkBtn = document.getElementById('copy-link-btn');
        const creatorSelect = document.getElementById('creator-select');
        
        if (backHomeBtn) backHomeBtn.onclick = () => window.location.href = '../home.html';
        if (validateAllBtn) validateAllBtn.onclick = () => this.validateAllWords();
        if (loadExampleBtn) loadExampleBtn.onclick = () => this.fillExample();
        if (clearBtn) clearBtn.onclick = () => this.clearForm();
        if (saveBtn) saveBtn.onclick = () => this.saveGame();
        if (copyLinkBtn) copyLinkBtn.onclick = () => this.copyLink();
        
        if (creatorSelect) {
            creatorSelect.onchange = (e) => {
                this.createdBy = e.target.value;
            };
        }
        
        // Individual word inputs
        document.querySelectorAll('.word-input').forEach(input => {
            input.oninput = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                this.updateTargetWord(idx, e.target.value);
                
                // Update just the validation indicator and preview without full re-render
                this.updateWordInputUI(idx);
            };
        });
        
        // Individual validate buttons
        for (let i = 0; i < 4; i++) {
            const validateBtn = document.getElementById(`validate-${i}`);
            if (validateBtn) {
                validateBtn.onclick = () => this.validateWord(i);
            }
        }
    }
}

export const adminComponent = new AdminComponent();
