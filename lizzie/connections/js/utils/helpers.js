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

// Shared across Wordle/Quordle/Connections (same localStorage, same origin)
// so picking your name in one game carries over to the others.
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
    localStorage.removeItem('LizzieUserId');
    localStorage.removeItem('LizzieUserName');
}
