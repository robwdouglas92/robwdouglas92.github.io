// Everything a player or creator typed goes through esc() before reaching innerHTML.
export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export const app = () => document.getElementById('app');

export function showMessage(title, message, { back = true } = {}) {
    app().innerHTML = `
        <div class="container">
            <header><h1>${esc(title)}</h1></header>
            <div class="card"><p>${esc(message)}</p></div>
            ${back ? '<button class="btn btn-secondary" id="msg-home">← Home</button>' : ''}
        </div>
    `;
    document.getElementById('msg-home')?.addEventListener('click', () => {
        window.location.search = '';
    });
}
