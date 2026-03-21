import * as Location from 'expo-location';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    useColorScheme,
    View,
} from 'react-native';

import { DestinationSearch } from '@/components/destination-search';
import { LeafletMap } from '@/components/leaflet-map';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { CrimePoint, highRiskCrimes } from '@/lib/crime';
import { db } from '@/lib/firebase';
import { Coordinate, fetchSafeRoute, RouteResult } from '@/lib/routing';

interface Contact { uid: string; displayName: string; email: string; }

export default function MapScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const [location, setLocation] = useState<Coordinate | null>(null);
  const [destCoord, setDestCoord] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [sharingWith, setSharingWith] = useState<Set<string>>(new Set());
  const [crimePoints, setCrimePoints] = useState<CrimePoint[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'contacts'), where('ownerUid', '==', user.uid));
    return onSnapshot(q, (snap) => setContacts(snap.docs.map((d) => d.data() as Contact & { ownerUid: string })));
  }, [user]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setLocation(coord);
      // Initial crimes fetched via onBoundsChange once map reports its viewport
    })();
  }, []);

  async function handleRoute() {
    if (!location || !destCoord) return;
    setLoading(true);
    try {
      const result = await fetchSafeRoute(location, destCoord, highRiskCrimes(crimePoints));
      setRoute(result);
    } catch (e: any) {
      Alert.alert('Routing error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSharing() {
    if (!user) return;
    if (sharing) {
      watchRef.current?.remove();
      // Remove all locationShare docs for this user
      for (const uid of sharingWith) {
        await deleteDoc(doc(db, 'locationShares', `${user.uid}_${uid}`));
      }
      setSharingWith(new Set());
      setSharing(false);
    } else {
      if (contacts.length === 0) {
        Alert.alert('No contacts', 'Add contacts first to share your journey.');
        return;
      }
      setShowSharePicker(true);
    }
  }

  async function startSharingWith(selectedUids: string[]) {
    if (!user) return;
    setShowSharePicker(false);
    if (selectedUids.length === 0) return;
    setSharingWith(new Set(selectedUids));
    // Write route coords once upfront (they don't change during the journey)
    const routeCoords = route?.coordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })) ?? [];
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      async (loc) => {
        if (!user) return;
        for (const uid of selectedUids) {
          await setDoc(doc(db, 'locationShares', `${user.uid}_${uid}`), {
            uid: user.uid,
            displayName: user.displayName ?? user.email ?? 'User',
            sharedWithUid: uid,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            routeCoords,
            updatedAt: serverTimestamp(),
          });
        }
      }
    );
    setSharing(true);
  }

  async function sendSOS() {
    if (!user || !location) return;
    setSosLoading(true);
    try {
      await setDoc(doc(db, 'sos', user.uid), {
        uid: user.uid,
        displayName: user.displayName ?? 'Anonymous',
        latitude: location.latitude,
        longitude: location.longitude,
        sentAt: serverTimestamp(),
      });
      Alert.alert('SOS Sent', 'Your contacts have been alerted with your location.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSosLoading(false);
    }
  }

  const mins = route ? Math.round(route.durationSeconds / 60) : null;
  const km = route ? (route.distanceMeters / 1000).toFixed(1) : null;

  return (
    <View style={styles.container}>
      <LeafletMap
        location={location}
        routeCoords={route?.coordinates ?? []}
        showHeatmap={showHeatmap}
        onCrimeData={(points) => setCrimePoints(points)}
      />

      <DestinationSearch
        onSelect={(coord) => setDestCoord(coord)}
        onSubmit={handleRoute}
        loading={loading}
      />

      {/* Heatmap toggle — bottom-left, above tab bar */}
      <TouchableOpacity
        style={[styles.heatmapToggle, { backgroundColor: showHeatmap ? '#FF3B30' : colors.backgroundElement }]}
        onPress={() => setShowHeatmap((v) => !v)}>
        <Text style={[styles.heatmapToggleText, { color: showHeatmap ? '#fff' : colors.text }]}>
          {showHeatmap ? '🔥 On' : '🔥 Off'}
        </Text>
      </TouchableOpacity>

      {/* SOS button — bottom-right, above tab bar */}
      <TouchableOpacity style={styles.sosBtn} onPress={sendSOS} disabled={sosLoading}>
        {sosLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.sosBtnText}>SOS</Text>
        )}
      </TouchableOpacity>

      {/* Share journey + route info — only shown when relevant */}
      {(route || sharing) && (
        <View style={[styles.routeBar, { backgroundColor: colors.background }]}>
          {route && (
            <Text style={[styles.routeInfo, { color: colors.textSecondary }]}>
              {km} km · {mins} min · Main roads
            </Text>
          )}
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: sharing ? '#34C759' : '#208AEF' }]}
            onPress={toggleSharing}>
            <Text style={styles.shareBtnText}>
              {sharing ? `Sharing (${sharingWith.size})` : 'Share Journey'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Share journey button when no route yet */}
      {!route && !sharing && (
        <TouchableOpacity
          style={[styles.shareFloating, { backgroundColor: colors.backgroundElement }]}
          onPress={toggleSharing}>
          <Text style={[styles.shareBtnText, { color: colors.text }]}>Share Journey</Text>
        </TouchableOpacity>
      )}

      {/* Contact picker modal */}
      <ContactPickerModal
        visible={showSharePicker}
        contacts={contacts}
        colors={colors}
        onConfirm={startSharingWith}
        onCancel={() => setShowSharePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Route info bar — appears above tab bar when a route is active
  routeBar: {
    position: 'absolute',
    bottom: 90,
    left: Spacing.three,
    right: Spacing.three,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  routeInfo: { flex: 1, fontSize: 13 },
  shareBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: 10,
  },
  shareBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  // Share button when no route yet — bottom-center
  shareFloating: {
    position: 'absolute',
    bottom: 100,
    left: '25%',
    right: '25%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // SOS — bottom-right corner
  sosBtn: {
    position: 'absolute',
    bottom: 100,
    right: Spacing.three,
    backgroundColor: '#FF3B30',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  sosBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  // Crime heatmap toggle — bottom-left corner
  heatmapToggle: {
    position: 'absolute',
    bottom: 100,
    left: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  heatmapToggleText: { fontWeight: '600', fontSize: 13 },
});

function ContactPickerModal({
  visible, contacts, colors, onConfirm, onCancel,
}: {
  visible: boolean;
  contacts: Contact[];
  colors: any;
  onConfirm: (uids: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={pickerStyles.overlay}>
        <View style={[pickerStyles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[pickerStyles.title, { color: colors.text }]}>Share journey with</Text>
          {contacts.map((c) => (
            <TouchableOpacity
              key={c.uid}
              style={[pickerStyles.row, { backgroundColor: colors.backgroundElement }]}
              onPress={() => toggle(c.uid)}>
              <View style={pickerStyles.avatar}>
                <Text style={pickerStyles.avatarText}>{(c.displayName || c.email)[0].toUpperCase()}</Text>
              </View>
              <Text style={[pickerStyles.name, { color: colors.text }]}>{c.displayName || c.email}</Text>
              <View style={[pickerStyles.check, selected.has(c.uid) && pickerStyles.checkActive]}>
                {selected.has(c.uid) && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}
          <View style={pickerStyles.btns}>
            <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pickerStyles.confirmBtn, selected.size === 0 && { opacity: 0.4 }]}
              onPress={() => { onConfirm([...selected]); setSelected(new Set()); }}
              disabled={selected.size === 0}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.two, borderRadius: 10, gap: Spacing.two },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#208AEF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  name: { flex: 1, fontSize: 15 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  btns: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  cancelBtn: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center' },
  confirmBtn: { flex: 1, backgroundColor: '#208AEF', paddingVertical: Spacing.two, borderRadius: 10, alignItems: 'center' },
});
