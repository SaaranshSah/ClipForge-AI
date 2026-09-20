"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Config from your project — also overridable via NEXT_PUBLIC_ env for Netlify
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD6gnGoSEraOVbss9QMOaaZT502rtpDETU",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "clipforge-ai-910f9.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://clipforge-ai-910f9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "clipforge-ai-910f9",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "clipforge-ai-910f9.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "892050276818",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:892050276818:web:c827cf86dee53bd378880b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-RV1Z109SRH",
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

let auth: Auth;
export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(app);
  return auth;
}

let db: Firestore;
export function getFirebaseDb(): Firestore {
  if (!db) db = getFirestore(app);
  return db;
}

let storage: FirebaseStorage;
export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(app);
  return storage;
}

let analytics: Analytics | null = null;
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (analytics) return analytics;
  if (await isSupported()) {
    try {
      analytics = getAnalytics(app);
    } catch {
      analytics = null;
    }
  }
  return analytics;
}

export { app, firebaseConfig };
