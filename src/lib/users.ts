import {
    collection, doc, getDoc, getDocs,
    query, setDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
}

/** Call on login/signup to upsert the user's profile */
export async function upsertUserProfile(uid: string, email: string, displayName: string) {
  await setDoc(doc(db, 'users', uid), { uid, email, displayName }, { merge: true });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function searchUserByEmail(email: string): Promise<UserProfile | null> {
  const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as UserProfile;
}

/** Conversation ID is always the two UIDs sorted and joined */
export function conversationId(uid1: string, uid2: string) {
  return [uid1, uid2].sort().join('_');
}
