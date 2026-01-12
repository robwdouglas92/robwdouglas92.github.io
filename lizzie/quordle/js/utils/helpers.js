export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getCurrentUserId() {
    return localStorage.getItem('LizzieQuordleUserId');
}

export function getCurrentUserName() {
    return localStorage.getItem('LizzieQuordleUserName');
}

export function setCurrentUser(userId, userName) {
    localStorage.setItem('LizzieQuordleUserId', userId);
    localStorage.setItem('LizzieQuordleUserName', userName);
}

export function clearCurrentUser() {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
}
