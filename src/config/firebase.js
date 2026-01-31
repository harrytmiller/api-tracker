import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Replace with your Firebase config from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyA6Wo6NWh_n08t2ixwxaY-4_ZCXWRjO7ic",
  authDomain: "resumate-d9951.firebaseapp.com",
  projectId: "resumate-d9951",
  storageBucket: "resumate-d9951.firebasestorage.app",
  messagingSenderId: "349816725671",
  appId: "1:349816725671:web:8c94632a4efe3d01e63b82",
  measurementId: "G-E6QFWQ4T0Z"
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);