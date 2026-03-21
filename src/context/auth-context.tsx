<<<<<<< HEAD
import { useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { auth } from '@/lib/firebase';
import { upsertUserProfile } from '@/lib/users';
=======
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { auth } from '@/lib/firebase';
>>>>>>> a74c0b5d9cdc6da358fa73bcb44874fafea5f001

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
<<<<<<< HEAD
  const router = useRouter();
  const segments = useSegments();
=======
>>>>>>> a74c0b5d9cdc6da358fa73bcb44874fafea5f001

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
<<<<<<< HEAD
      if (u) {
        upsertUserProfile(u.uid, u.email ?? '', u.displayName ?? u.email ?? 'User');
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthScreen = segments[0] === 'auth';
    if (!user && !inAuthScreen) {
      router.replace('/auth');
    } else if (user && inAuthScreen) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

=======
    });
    // Sign in anonymously if not already signed in
    signInAnonymously(auth).catch(console.error);
    return unsub;
  }, []);

>>>>>>> a74c0b5d9cdc6da358fa73bcb44874fafea5f001
  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
