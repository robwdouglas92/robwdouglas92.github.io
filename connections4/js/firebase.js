import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBjiragFxVWw-oHPpf23E7CujI5yZrP5U8",
    authDomain: "family-connections-de1a6.firebaseapp.com",
    projectId: "family-connections-de1a6",
    storageBucket: "family-connections-de1a6.appspot.com",
    messagingSenderId: "255614664421",
    appId: "1:255614664421:web:1a48b3b5cc119ea8a35e0c"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

console.log('Firebase initialized');
