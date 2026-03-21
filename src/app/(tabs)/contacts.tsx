import { Ionicons } from '@expo/vector-icons';
import {
    collection, deleteDoc, doc, onSnapshot,
    query, setDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    Alert, FlatList, StyleSheet, Text,
    TextInput, TouchableOpacity, useColorScheme, View,
} from 'react-native';

import { LeafletMap } from '@/components/leaflet-map';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { searchUserByEmail, UserProfile } from '@/lib/users';

interface Contact { uid: string; email: string; displayName: string; }
interface SharedLocation {
  uid: string;
  displayName: string;
  latitude: number;
  longitude: number;
  routeCoords?: Array<{ lat: number; lng: number }>;
}

export default function ContactsScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [tab, setTab] = useState<'contacts' | 'sharing'>('contacts');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedLocation[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SharedLocation | null>(null);
  const [liveSelected, setLiveSelected] = useState<SharedLocation | null>(null);

  // Live listener for the selected person's location + route
  useEffect(() => {
    if (!selected || !user) { setLiveSelected(null); return; }
    const docRef = doc(db, 'locationShares', `${selected.uid}_${user.uid}`);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) setLiveSelected(snap.data() as SharedLocation);
    });
    return unsub;
  }, [selected, user]);

  // My contacts list
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'contacts'), where('ownerUid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setContacts(snap.docs.map((d) => d.data() as Contact & { ownerUid: string }));
    });
  }, [user]);

  // Locations shared with me
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'locationShares'), where('sharedWithUid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setSharedWithMe(snap.docs.map((d) => d.data() as SharedLocation & { sharedWithUid: string }));
    });
  }, [user]);

  async function addContact() {
    if (!user || !searchEmail.trim()) return;
    setSearching(true);
    try {
      const found: UserProfile | null = await searchUserByEmail(searchEmail);
      if (!found) { Alert.alert('Not found', 'No user with that email.'); return; }
      if (found.uid === user.uid) { Alert.alert('Error', "You can't add yourself."); return; }
      await setDoc(doc(db, 'contacts', `${user.uid}_${found.uid}`), {
        ownerUid: user.uid,
        uid: found.uid,
        email: found.email,
        displayName: found.displayName,
      });
      setSearchEmail('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSearching(false);
    }
  }

  async function removeContact(contactUid: string) {
    if (!user) return;
    await deleteDoc(doc(db, 'contacts', `${user.uid}_${contactUid}`));
  }

  if (selected) {
    const live = liveSelected ?? selected;
    const routeCoords = (live.routeCoords ?? []).map((c) => ({ latitude: c.lat, longitude: c.lng }));
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.backgroundElement }]}
          onPress={() => { setSelected(null); setLiveSelected(null); }}>
          <Text style={{ color: colors.text }}>← Back</Text>
        </TouchableOpacity>
        <LeafletMap
          location={{ latitude: live.latitude, longitude: live.longitude }}
          routeCoords={routeCoords}
        />
        <View style={[styles.nameTag, { backgroundColor: colors.background }]}>
          <Text style={[styles.nameTagText, { color: colors.text }]}>{live.displayName}</Text>
          {routeCoords.length > 0 && (
            <Text style={[styles.nameTagSub, { color: colors.textSecondary }]}>Route visible</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Contacts</Text>

      {/* Tab switcher */}
      <View style={[styles.tabs, { backgroundColor: colors.backgroundElement }]}>
        {(['contacts', 'sharing'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabBtnText, { color: tab === t ? '#fff' : colors.textSecondary }]}>
              {t === 'contacts' ? 'My Contacts' : 'Shared With Me'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'contacts' ? (
        <>
          {/* Search / add */}
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
              placeholder="Add by email..."
              placeholderTextColor={colors.textSecondary}
              value={searchEmail}
              onChangeText={setSearchEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={addContact}
              disabled={searching}>
              <Ionicons name="person-add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={contacts}
            keyExtractor={(c) => c.uid}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                No contacts yet. Add someone by email.
              </Text>
            }
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.displayName || item.email)[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.displayName || item.email}</Text>
                  <Text style={[styles.sub, { color: colors.textSecondary }]}>{item.email}</Text>
                </View>
                <TouchableOpacity onPress={() => removeContact(item.uid)}>
                  <Ionicons name="person-remove-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      ) : (
        <FlatList
          data={sharedWithMe}
          keyExtractor={(s) => s.uid}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Nobody is sharing their location with you right now.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.backgroundElement }]}
              onPress={() => setSelected(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.displayName[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.displayName}</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>Sharing live location</Text>
              </View>
              <View style={styles.dot} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', paddingHorizontal: Spacing.three, marginBottom: Spacing.two },
  tabs: { flexDirection: 'row', marginHorizontal: Spacing.three, borderRadius: 10, padding: 3, marginBottom: Spacing.two },
  tabBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#ff8500' },
  tabBtnText: { fontWeight: '600', fontSize: 13 },
  searchRow: { flexDirection: 'row', paddingHorizontal: Spacing.three, gap: Spacing.two, marginBottom: Spacing.two },
  searchInput: { flex: 1, borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: 10, fontSize: 15 },
  addBtn: { backgroundColor: '#ff8500', borderRadius: 10, width: 44, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  card: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, borderRadius: 12, gap: Spacing.two },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ff8500', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  name: { fontWeight: '600', fontSize: 15 },
  sub: { fontSize: 13 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759' },
  empty: { textAlign: 'center', marginTop: Spacing.six, fontSize: 15 },
  backBtn: { position: 'absolute', top: 56, left: 16, zIndex: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 8 },
  nameTag: { position: 'absolute', bottom: 100, alignSelf: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 20, alignItems: 'center' },
  nameTagText: { fontWeight: '600' },
  nameTagSub: { fontSize: 12, marginTop: 2 },
});
