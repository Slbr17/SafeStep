import { collection, onSnapshot, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { LeafletMap } from '@/components/leaflet-map';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';

interface Journey {
  uid: string;
  displayName: string;
  latitude: number;
  longitude: number;
  updatedAt: any;
}

export default function ContactsScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selected, setSelected] = useState<Journey | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'journeys'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => d.data() as Journey)
        .filter((j) => j.uid !== user?.uid);
      setJourneys(data);
    });
    return unsub;
  }, [user]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Live Journeys</Text>

      {selected ? (
        <View style={styles.mapContainer}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.backgroundElement }]}
            onPress={() => setSelected(null)}>
            <Text style={{ color: colors.text }}>← Back</Text>
          </TouchableOpacity>
          <LeafletMap
            location={{ latitude: selected.latitude, longitude: selected.longitude }}
            routeCoords={[]}
          />
        </View>
      ) : (
        <FlatList
          data={journeys}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No contacts are sharing their journey right now.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.backgroundElement }]}
              onPress={() => setSelected(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.displayName[0]?.toUpperCase()}</Text>
              </View>
              <View>
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
  title: { fontSize: 24, fontWeight: '700', paddingHorizontal: Spacing.three, marginBottom: Spacing.three },
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
    gap: Spacing.three,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ff8500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  name: { fontWeight: '600', fontSize: 16 },
  sub: { fontSize: 13 },
  dot: { marginLeft: 'auto', width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759' },
  empty: { textAlign: 'center', marginTop: Spacing.six, fontSize: 15 },
  mapContainer: { flex: 1 },
  backBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
});
