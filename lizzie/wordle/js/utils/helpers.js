export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getCurrentUserId() {
    return localStorage.getItem('LizzieWordleUserId');
}

export function getCurrentUserName() {
    return localStorage.getItem('LizzieWordleUserName');
}

export function setCurrentUser(userId, userName) {
    localStorage.setItem('LizzieWordleUserId', userId);
    localStorage.setItem('LizzieWordleUserName', userName);
}

export function clearCurrentUser() {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
}
