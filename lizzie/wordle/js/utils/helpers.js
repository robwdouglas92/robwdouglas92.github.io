export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getCurrentUserId() {
    return localStorage.getItem('userId');
}

export function getCurrentUserName() {
    return localStorage.getItem('userName');
}

export function setCurrentUser(userId, userName) {
    localStorage.setItem('userId', userId);
    localStorage.setItem('userName', userName);
}

export function clearCurrentUser() {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
}
