import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Replace these with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyBCkF8peLh-0iafIZk-_yuLPkcboMEKlyk",
  authDomain: "htg-app-77dd8.firebaseapp.com",
  projectId: "htg-app-77dd8",
  storageBucket: "htg-app-77dd8.firebasestorage.app",
  messagingSenderId: "546111978581",
  appId: "1:546111978581:web:b9be6c8d8db16c65ace8dc",
  measurementId: "G-R76F1EY1E8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
