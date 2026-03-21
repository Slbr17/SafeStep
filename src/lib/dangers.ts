import {
    addDoc,
    collection,
    doc,
    increment,
    onSnapshot,
    updateDoc
} from 'firebase/firestore';
import { db } from './firebase';

export type DangerType = 'suspicious_person' | 'unsafe_area' | 'hazard' | 'other';

export interface Danger {
  id: string;
  lat: number;
  lng: number;
  type: DangerType;
  description: string;
  reportedBy: string;
  reportedByName: string;
  reportedAt: number; // ms timestamp
  upvotes: number;
}

export const DANGER_LABELS: Record<DangerType, string> = {
  suspicious_person: 'Suspicious Person',
  unsafe_area: 'Unsafe Area',
  hazard: 'Hazard',
  other: 'Other',
};

export const DANGER_ICONS: Record<DangerType, string> = {
  suspicious_person: '👤',
  unsafe_area: '⚠️',
  hazard: '🚧',
  other: '❗',
};

export function subscribeDangers(callback: (dangers: Danger[]) => void) {
  return onSnapshot(collection(db, 'dangers'), (snap) => {
    const dangers = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Danger));
    callback(dangers);
  });
}

export async function reportDanger(
  lat: number,
  lng: number,
  type: DangerType,
  description: string,
  uid: string,
  displayName: string
) {
  await addDoc(collection(db, 'dangers'), {
    lat,
    lng,
    type,
    description,
    reportedBy: uid,
    reportedByName: displayName,
    reportedAt: Date.now(),
    upvotes: 0,
  });
}

export async function upvoteDanger(id: string) {
  await updateDoc(doc(db, 'dangers', id), { upvotes: increment(1) });
}
