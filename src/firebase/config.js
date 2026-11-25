import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAaaaUdl3Tv6Ip6yWY9_INXVmWWdMtVz10",
  authDomain: "bible-data-dd38d.firebaseapp.com",
  projectId: "bible-data-dd38d",
  storageBucket: "bible-data-dd38d.firebasestorage.app",
  messagingSenderId: "1061041094126",
  appId: "1:1061041094126:web:a2d14a3d08b5e9cc7622ff"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});