import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCeQR6HCwmMbdrE5SN5VaY5HUJusB2RrYw",
  authDomain: "sariyer-2f17c.firebaseapp.com",
  projectId: "sariyer-2f17c",
  storageBucket: "sariyer-2f17c.appspot.com",
  messagingSenderId: "1025571425910",
  appId: "1:1025571425910:web:9ac3e4c19642e3b121d957",
  databaseURL: "https://sariyer-2f17c-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export default app;
