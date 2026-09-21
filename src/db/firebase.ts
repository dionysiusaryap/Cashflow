import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDv-hOLJKLe5oZy-a8oX5oOb4bdXMxtJdw",
  authDomain: "cashflow-ae5ac.firebaseapp.com",
  projectId: "cashflow-ae5ac",
  storageBucket: "cashflow-ae5ac.firebasestorage.app",
  messagingSenderId: "478701337758",
  appId: "1:478701337758:web:49d70ca95d1864ea304f8f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
