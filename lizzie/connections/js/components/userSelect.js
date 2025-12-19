import { db } from '../firebase.js';
import { collection, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { setCurrentUser } from '../utils/helpers.js';
import { router } from '../router.js';

class UserSelectComponent {
    constructor() {
        this.availableUsers = [];
        this.isNewUser = false;
        this.newUserName = '';
        this.message = '';
        this.messageType = '';
    }

    async loadUsers() {
        try {
            const usersRef = collection(db, "users");
            const snapshot = await getDocs(usersRef);
            this.availableUsers = [];
            snapshot.forEach(doc => {
                this.availableUsers.push({
                    id: doc.id,
                    name: doc.data().name
                });
            });
            console.log('Loaded users:', this.availableUsers.length);
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    async createUser(name) {
        try {
            const userId = 'user_' + Math.random().toString(36).substring(2, 9);
            const userRef = doc(db, "users", userId);
            await setDoc(userRef, {
                name: name,
                createdAt: new Date().toISOString()
            });
            
            setCurrentUser(userId, name);
            console.log('Created user:', userId, name);
            return true;
        } catch (error) {
            console.error('Error creating user:', error);
            return false;
        }
    }

    selectUser(userId, userName) {
        setCurrentUser(userId, userName);
        console.log('Selected user:', userId, userName);
    }

    async handleSubmit() {
        if (this.isNewUser) {
            const name = this.newUserName.trim();
            if (!name) {
                this.message = 'Please enter your name';
                this.messageType = 'error';
                this.render();
                return;
            }
            
            const success = await this.createUser(name);
            if (success) {
                // Reload the current route (game)
                router.handleRoute();
            } else {
                this.message = 'Error creating profile';
                this.messageType = 'error';
                this.render();
            }
        } else {
            const select = document.getElementById('user-select');
            if (select && select.value) {
                const selectedUser = this.availableUsers.find(u => u.id === select.value);
                if (selectedUser) {
                    this.selectUser(selectedUser.id, selectedUser.name);
                    router.handleRoute();
                }
            } else {
                this.message = 'Please select a player';
                this.messageType = 'error';
                this.render();
            }
        }
    }

    toggleNewUser() {
        this.isNewUser = !this.isNewUser;
        this.message = '';
        this.render();
    }

    async render() {
        await this.loadUsers();
        
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="modal">
                <div class="modal-content">
                    <h2 class="modal-title">Who's Playing?</h2>
                    
                    ${this.message ? `<div class="message msg-${this.messageType}">${this.message}</div>` : ''}
                    
                    ${!this.isNewUser ? `
                        <p style="color: #4b5563; margin-bottom: 1rem;">Select your name:</p>
                        <select id="user-select" class="input">
                            <option value="">Choose your name...</option>
                            ${this.availableUsers.map(user => `
                                <option value="${user.id}">${user.name}</option>
                            `).join('')}
                        </select>
                        <button class="btn btn-primary" id="submit-btn" style="width: 100%; margin-bottom: 0.5rem;">Start Playing</button>
                        <button class="btn btn-secondary" id="toggle-btn" style="width: 100%;">New Player?</button>
                    ` : `
                        <p style="color: #4b5563; margin-bottom: 1rem;">Enter your name to create a profile:</p>
                        <input type="text" id="name-input" class="input" placeholder="Your name" value="${this.newUserName}">
                        <button class="btn btn-primary" id="submit-btn" style="width: 100%; margin-bottom: 0.5rem;">Create Profile</button>
                        <button class="btn btn-secondary" id="toggle-btn" style="width: 100%;">Back to Selection</button>
                    `}
                </div>
            </div>
        `;

        this.attachListeners();
    }

    attachListeners() {
        const submitBtn = document.getElementById('submit-btn');
        const toggleBtn = document.getElementById('toggle-btn');
        const input = document.getElementById('name-input');

        if (submitBtn) submitBtn.onclick = () => this.handleSubmit();
        if (toggleBtn) toggleBtn.onclick = () => this.toggleNewUser();
        if (input) {
            input.focus();
            input.oninput = (e) => {
                this.newUserName = e.target.value;
            };
            input.onkeypress = (e) => {
                if (e.key === 'Enter') this.handleSubmit();
            };
        }
    }
}

export const userSelectComponent = new UserSelectComponent();
