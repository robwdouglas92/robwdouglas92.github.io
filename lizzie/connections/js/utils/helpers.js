export function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getCurrentUserId() {
    return localStorage.getItem('LizzieUserId');
}

export function getCurrentUserName() {
    return localStorage.getItem('LizzieUserName');
}

export function setCurrentUser(userId, userName) {
    localStorage.setItem('LizzieUserId', userId);
    localStorage.setItem('LizzieUserName', userName);
}

export function clearCurrentUser() {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
}
