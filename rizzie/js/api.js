// Every Firebase read/write in Rizzie goes through this file.
//
// Sign-in is username + 6-digit PIN. Under the hood each player is a Firebase
// email/password account with a made-up address nobody ever sees:
// "<profile id>@rizzie.app" (after a PIN reset, "<profile id>.<suffix>@...").
// firestore.rules reads the profile id back out of that address, so the
// profile id must never contain a dot.
import { auth, db } from './firebase.js';
import {
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
    doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, getDocs,
    serverTimestamp, writeBatch, Timestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const EMAIL_DOMAIN = 'rizzie.app';
const RESET_CODE_HOURS = 24;

let session = null;

// "Auntie Sue" → "auntie-sue". Used as the profiles doc id and sign-in email.
export function profileIdFor(username) {
    return username.trim().toLowerCase().replace(/\s+/g, '-');
}

export function usernameError(username) {
    const name = username.trim();
    if (name.length < 2 || name.length > 20) return 'Usernames are 2–20 characters.';
    if (!/^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/.test(name)) return 'Use letters, numbers and single spaces only.';
    return null;
}

export function pinError(pin) {
    return /^\d{6}$/.test(pin) ? null : 'Your PIN must be exactly 6 digits.';
}

function friendlyAuthError(err) {
    switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
            return 'That PIN isn’t right.';
        case 'auth/too-many-requests':
            return 'Too many tries — wait a few minutes and try again.';
        case 'auth/network-request-failed':
            return 'No connection — check your internet and try again.';
        default:
            return err.message || 'Something went wrong.';
    }
}

// Resolves once Firebase has restored any saved login, so a returning phone
// goes straight in without asking for the PIN again.
export async function loadSession() {
    if (!auth) return null;
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) {
        session = null;
        return null;
    }
    const id = user.email.split('@')[0].split('.')[0];
    const snap = await getDoc(doc(db, 'profiles', id));
    // A login whose profile has since been reclaimed (PIN reset) is stale.
    if (!snap.exists() || snap.data().authUid !== user.uid) {
        await fbSignOut(auth);
        session = null;
        return null;
    }
    session = { id, uid: user.uid, ...snap.data() };
    return session;
}

export const getSession = () => session;

export async function signUp(username, pin) {
    const id = profileIdFor(username);
    const existing = await getDoc(doc(db, 'profiles', id));
    if (existing.exists()) throw new Error('That username is taken. If it’s you, sign in instead.');

    const email = `${id}@${EMAIL_DOMAIN}`;
    let cred;
    try {
        cred = await createUserWithEmailAndPassword(auth, email, pin);
    } catch (err) {
        // A previous sign-up made the login but failed before writing the
        // profile — finish it off rather than leaving the name stuck.
        if (err.code !== 'auth/email-already-in-use') throw new Error(friendlyAuthError(err));
        try {
            cred = await signInWithEmailAndPassword(auth, email, pin);
        } catch {
            throw new Error('That username is taken. If it’s you, sign in instead.');
        }
    }
    await setDoc(doc(db, 'profiles', id), {
        username: username.trim(),
        authUid: cred.user.uid,
        authEmail: email,
        isCreator: false,
        isAdmin: false,
        createdAt: serverTimestamp(),
    });
    return loadSession();
}

export async function signIn(username, pin) {
    const snap = await getDoc(doc(db, 'profiles', profileIdFor(username)));
    if (!snap.exists()) throw new Error('No player with that username. Check the spelling, or create a new player.');
    try {
        await signInWithEmailAndPassword(auth, snap.data().authEmail, pin);
    } catch (err) {
        throw new Error(friendlyAuthError(err));
    }
    return loadSession();
}

export async function signOut() {
    await fbSignOut(auth);
    session = null;
}

// ---- PIN resets ----
//
// A web page can't change someone else's Firebase password (that needs server
// code, which would need the paid plan). So instead an admin issues a one-time
// code, and the player uses it to make a brand-new login and point their
// existing profile at it. Scores, games and roles all hang off the profile, so
// nothing is lost; the old login is simply never used again.

export async function reclaimProfile(username, code, newPin) {
    const id = profileIdFor(username);
    const snap = await getDoc(doc(db, 'profiles', id));
    if (!snap.exists()) throw new Error('No player with that username. Check the spelling.');

    // A fresh hidden email each time, since the old one still belongs to the old login.
    const email = `${id}.${Date.now().toString(36)}@${EMAIL_DOMAIN}`;
    let cred;
    try {
        cred = await createUserWithEmailAndPassword(auth, email, newPin);
    } catch (err) {
        throw new Error(friendlyAuthError(err));
    }

    // firestore.rules checks the code against the admin-only resets doc, and
    // the same write uses it up.
    const batch = writeBatch(db);
    batch.update(doc(db, 'profiles', id), { authUid: cred.user.uid, authEmail: email, resetCode: code });
    batch.delete(doc(db, 'resets', id));
    try {
        await batch.commit();
    } catch (err) {
        console.error(err);
        await cred.user.delete().catch(() => {});
        throw new Error('That reset code isn’t right, or it has expired. Ask an admin for a new one.');
    }
    return loadSession();
}

// ---- Admin ----

export async function fetchProfiles() {
    const snap = await getDocs(collection(db, 'profiles'));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.username.localeCompare(b.username));
}

export function setRoles(id, roles) {
    return updateDoc(doc(db, 'profiles', id), roles);
}

export async function fetchResets() {
    const snap = await getDocs(collection(db, 'resets'));
    return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
}

export async function issueReset(id) {
    const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const reset = {
        code: String(digits).padStart(6, '0'),
        expiresAt: Timestamp.fromMillis(Date.now() + RESET_CODE_HOURS * 3600 * 1000),
        issuedBy: session.id,
    };
    await setDoc(doc(db, 'resets', id), reset);
    return reset;
}

export function cancelReset(id) {
    return deleteDoc(doc(db, 'resets', id));
}

// ---- Games ----

export async function fetchGames() {
    const snap = await getDocs(query(collection(db, 'games'), where('status', '==', 'published')));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => millis(b.publishedAt ?? b.createdAt) - millis(a.publishedAt ?? a.createdAt));
}

const millis = ts => ts?.toMillis?.() ?? 0;

export async function fetchGame(gameId) {
    const snap = await getDoc(doc(db, 'games', gameId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Games start as drafts (saved as you go, invisible to players) and become
// playable once published.

export async function fetchMyDrafts() {
    const snap = await getDocs(query(collection(db, 'games'), where('createdBy', '==', session.id)));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(g => g.status === 'draft')
        .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
}

export async function createDraft({ title, prompts }) {
    const ref = await addDoc(collection(db, 'games'), {
        title,
        prompts,
        createdBy: session.id,
        createdByName: session.username,
        status: 'draft',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return ref.id;
}

export function saveDraft(gameId, { title, prompts }) {
    return updateDoc(doc(db, 'games', gameId), { title, prompts, updatedAt: serverTimestamp() });
}

export function publishGame(gameId, { title, prompts }) {
    return updateDoc(doc(db, 'games', gameId), {
        title,
        prompts,
        status: 'published',
        updatedAt: serverTimestamp(),
        publishedAt: serverTimestamp(),
    });
}

export function deleteGame(gameId) {
    return deleteDoc(doc(db, 'games', gameId));
}

// ---- Plays: one doc per player per game, id "<gameId>_<profile id>" ----

const playRef = gameId => doc(db, 'plays', `${gameId}_${session.id}`);

export async function fetchMyPlay(gameId) {
    const snap = await getDoc(playRef(gameId));
    return snap.exists() ? snap.data() : null;
}

export async function fetchMyPlays() {
    const snap = await getDocs(query(collection(db, 'plays'), where('username', '==', session.id)));
    return snap.docs.map(d => d.data());
}

export async function fetchPlays(gameId) {
    const snap = await getDocs(query(collection(db, 'plays'), where('gameId', '==', gameId)));
    return snap.docs.map(d => d.data());
}

// The play writes below are deliberately not awaited by the play screen: on
// iPhones the keyboard only opens if the answer box is focused inside the tap
// itself, so the next prompt is drawn first and the write catches up behind it.
// Firestore applies queued writes in order, so the create always lands first.

export function startPlay(gameId) {
    return setDoc(playRef(gameId), {
        gameId,
        username: session.id,
        displayName: session.username,
        status: 'in-progress',
        answers: [],
        total: 0,
        currentIndex: 0,
        currentStartedAt: Date.now(),
        startedAt: serverTimestamp(),
    });
}

export function startPrompt(gameId, index) {
    return updateDoc(playRef(gameId), { currentIndex: index, currentStartedAt: Date.now() });
}

export function saveAnswers(gameId, answers, finished) {
    const total = answers.reduce((sum, a) => sum + a.points, 0);
    return updateDoc(playRef(gameId), {
        answers,
        total,
        ...(finished ? { status: 'complete', finishedAt: serverTimestamp() } : {}),
    });
}
