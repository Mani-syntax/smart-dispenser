// firebase-config.js
// Firebase configuration for the Smart Medicine Dispenser Dashboard

const firebaseConfig = {
  apiKey: "AIzaSyAhJ4w9H5XG4WkYMQevxnCQoaiGNd5vSaA",
  authDomain: "smart-med-dispenser.firebaseapp.com",
  projectId: "smart-med-dispenser",
  storageBucket: "smart-med-dispenser.firebasestorage.app",
  messagingSenderId: "35737308950",
  appId: "1:35737308950:web:b9407e1d6180b4e5584a37",
  measurementId: "G-LNX5DN2CF7"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
