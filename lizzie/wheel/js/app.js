import { db } from './firebase.js';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const COLORS = ['#4A90E2', '#FFD93D', '#E24A6B', '#2ECC71', '#9B59B6', '#F6821F', '#1ABC9C', '#E74C3C'];
const SPIN_MS = 4200;
const POINTER_DEG = 270; // top of the wheel, in canvas-clockwise-from-3-o'clock degrees

class WheelApp {
    constructor() {
        this.items = [];
        this.spinning = false;
        this.modalOpen = false;
        this.pendingRedraw = false;
        this.removeAfterSpin = true;
    }

    init() {
        this.canvas = document.getElementById('wheel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.spinBtn = document.getElementById('spin-btn');
        this.tableBody = document.getElementById('activities-body');
        this.countEl = document.getElementById('activities-count');
        this.addInput = document.getElementById('add-input');
        this.addBtn = document.getElementById('add-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.removeToggle = document.getElementById('remove-toggle');
        this.errorEl = document.getElementById('list-error');
        this.modal = document.getElementById('winner-modal');
        this.modalText = document.getElementById('winner-text');
        this.modalNote = document.getElementById('winner-note');
        this.modalCloseBtn = document.getElementById('winner-close');

        this.removeToggle.checked = this.removeAfterSpin;

        this.addBtn.onclick = () => this.handleAdd();
        this.addInput.onkeypress = (e) => {
            if (e.key === 'Enter') this.handleAdd();
        };
        this.clearBtn.onclick = () => this.handleClearAll();
        this.removeToggle.onchange = (e) => {
            this.removeAfterSpin = e.target.checked;
        };
        this.spinBtn.onclick = () => this.spin();
        this.modalCloseBtn.onclick = () => this.closeModal();

        this.drawWheel();
        this.updateSpinButton();
        this.subscribe();
    }

    subscribe() {
        const itemsQuery = query(collection(db, 'LizzieWheelItems'), orderBy('createdAt', 'asc'));
        onSnapshot(itemsQuery, (snapshot) => {
            this.items = [];
            snapshot.forEach((docSnap) => {
                this.items.push({ id: docSnap.id, text: docSnap.data().text });
            });
            this.errorEl.textContent = '';
            this.renderTable();
            if (this.spinning || this.modalOpen) {
                this.pendingRedraw = true;
            } else {
                this.snapToRestAndRedraw();
            }
            this.updateSpinButton();
        }, (error) => {
            console.error('Error loading wheel items:', error);
            this.errorEl.textContent = "Couldn't load the list — check your connection and refresh.";
        });
    }

    async handleAdd() {
        const text = this.addInput.value.trim();
        if (!text) return;
        this.addBtn.disabled = true;
        try {
            await addDoc(collection(db, 'LizzieWheelItems'), {
                text,
                createdAt: serverTimestamp()
            });
            this.addInput.value = '';
            this.addInput.focus();
        } catch (error) {
            console.error('Error adding item:', error);
            this.errorEl.textContent = "Couldn't add that — try again.";
        } finally {
            this.addBtn.disabled = false;
        }
    }

    async handleUpdate(id, text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        try {
            await updateDoc(doc(db, 'LizzieWheelItems', id), { text: trimmed });
        } catch (error) {
            console.error('Error updating item:', error);
            this.errorEl.textContent = "Couldn't save that edit — try again.";
        }
    }

    async handleDelete(id) {
        try {
            await deleteDoc(doc(db, 'LizzieWheelItems', id));
        } catch (error) {
            console.error('Error deleting item:', error);
            this.errorEl.textContent = "Couldn't remove that — try again.";
        }
    }

    async handleClearAll() {
        if (this.items.length === 0) return;
        if (!confirm('Remove every activity from the wheel?')) return;
        this.clearBtn.disabled = true;
        try {
            await Promise.all(this.items.map((item) => deleteDoc(doc(db, 'LizzieWheelItems', item.id))));
        } catch (error) {
            console.error('Error clearing items:', error);
            this.errorEl.textContent = "Couldn't clear the list — try again.";
        } finally {
            this.clearBtn.disabled = false;
        }
    }

    renderTable() {
        if (this.items.length === 0) {
            this.tableBody.innerHTML = `
                <tr><td colspan="2" class="empty-row">No activities yet — add some on the left!</td></tr>
            `;
            this.countEl.textContent = '';
            return;
        }

        this.tableBody.innerHTML = this.items.map((item) => `
            <tr>
                <td>
                    <input type="text" class="input row-input" data-id="${item.id}" value="${escapeHtml(item.text)}">
                </td>
                <td class="row-actions">
                    <button class="icon-btn" data-delete="${item.id}" title="Remove">✕</button>
                </td>
            </tr>
        `).join('');

        this.countEl.textContent = `${this.items.length} ${this.items.length === 1 ? 'activity' : 'activities'} on the wheel`;

        this.tableBody.querySelectorAll('.row-input').forEach((input) => {
            input.onblur = (e) => this.handleUpdate(e.target.dataset.id, e.target.value);
            input.onkeypress = (e) => {
                if (e.key === 'Enter') e.target.blur();
            };
        });

        this.tableBody.querySelectorAll('[data-delete]').forEach((btn) => {
            btn.onclick = (e) => this.handleDelete(e.currentTarget.dataset.delete);
        });
    }

    updateSpinButton() {
        this.spinBtn.disabled = this.spinning || this.items.length === 0;
        this.spinBtn.textContent = this.spinning ? 'Spinning…' : '🎡 Spin the Wheel';
    }

    snapToRestAndRedraw() {
        this.canvas.style.transition = 'none';
        this.canvas.style.transform = 'rotate(0deg)';
        this.pendingRedraw = false;
        this.drawWheel();
    }

    drawWheel() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        const center = size / 2;
        const radius = center - 6;
        ctx.clearRect(0, 0, size, size);

        const n = this.items.length;
        if (n === 0) {
            ctx.beginPath();
            ctx.arc(center, center, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#f3f4f6';
            ctx.fill();
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = '#9ca3af';
            ctx.font = 'bold 16px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Add some', center, center - 12);
            ctx.fillText('activities!', center, center + 12);
            return;
        }

        const segRad = (Math.PI * 2) / n;
        this.items.forEach((item, i) => {
            const start = i * segRad;
            const end = start + segRad;

            ctx.beginPath();
            ctx.moveTo(center, center);
            ctx.arc(center, center, radius, start, end);
            ctx.closePath();
            ctx.fillStyle = COLORS[i % COLORS.length];
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.stroke();

            const mid = start + segRad / 2;
            const normalizedMid = ((mid % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            // Segments on the left half would otherwise render upside-down (text
            // reads outward from center, and that direction is inverted there) —
            // flip the rotation and mirror the alignment so every label stays
            // readable regardless of which side of the wheel it lands on.
            const flip = normalizedMid > Math.PI / 2 && normalizedMid < (3 * Math.PI) / 2;

            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(flip ? mid + Math.PI : mid);
            ctx.textAlign = flip ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 4;
            ctx.font = `bold ${n > 12 ? 11 : n > 7 ? 13 : 15}px Georgia, serif`;
            ctx.fillText(truncateLabel(item.text, n), flip ? -(radius - 14) : radius - 14, 0);
            ctx.restore();
        });
    }

    spin() {
        if (this.spinning || this.items.length === 0) return;

        this.spinning = true;
        this.updateSpinButton();

        // Always start each spin from a clean, un-rotated wheel so the
        // winner-index math below doesn't need to track prior rotation
        // across edits made between spins.
        this.canvas.style.transition = 'none';
        this.canvas.style.transform = 'rotate(0deg)';
        void this.canvas.offsetWidth; // force reflow before re-enabling transition

        const n = this.items.length;
        const winnerIndex = Math.floor(Math.random() * n);
        const segDeg = 360 / n;
        const midDeg = winnerIndex * segDeg + segDeg / 2;
        const delta = ((POINTER_DEG - midDeg) % 360 + 360) % 360;
        const extraSpins = 6 + Math.floor(Math.random() * 3);
        const target = extraSpins * 360 + delta;

        this.canvas.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.67, 0.1, 1)`;
        requestAnimationFrame(() => {
            this.canvas.style.transform = `rotate(${target}deg)`;
        });

        const onEnd = () => {
            this.canvas.removeEventListener('transitionend', onEnd);
            this.spinning = false;
            this.updateSpinButton();
            this.landOn(winnerIndex);
        };
        this.canvas.addEventListener('transitionend', onEnd);
    }

    async landOn(winnerIndex) {
        const winner = this.items[winnerIndex];
        if (!winner) {
            // The list changed mid-spin (an item was edited/removed elsewhere);
            // play it safe and just skip announcing a stale winner.
            this.applyPendingRedraw();
            return;
        }

        this.openModal(winner.text, this.removeAfterSpin);

        if (this.removeAfterSpin) {
            await this.handleDelete(winner.id);
        }
    }

    openModal(text, wasRemoved) {
        this.modalOpen = true;
        this.modalText.textContent = `🎉 ${text}`;
        this.modalNote.textContent = wasRemoved
            ? 'Removed from the wheel — spin again for something new.'
            : 'Still on the wheel for next time.';
        this.modal.style.display = 'flex';
    }

    closeModal() {
        this.modalOpen = false;
        this.modal.style.display = 'none';
        this.applyPendingRedraw();
    }

    applyPendingRedraw() {
        if (this.pendingRedraw) {
            this.snapToRestAndRedraw();
        }
    }
}

function truncateLabel(text, segmentCount) {
    const maxLen = segmentCount > 12 ? 14 : segmentCount > 7 ? 18 : 24;
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const wheelApp = new WheelApp();
document.addEventListener('DOMContentLoaded', () => wheelApp.init());
