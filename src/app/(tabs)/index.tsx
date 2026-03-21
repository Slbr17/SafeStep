import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View
} from 'react-native';

import { DestinationSearch } from '@/components/destination-search';
import { LeafletMap } from '@/components/leaflet-map';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { CrimePoint, highRiskCrimes } from '@/lib/crime';
import { Danger, DANGER_ICONS, DANGER_LABELS, DangerType, reportDanger, subscribeDangers, upvoteDanger } from '@/lib/dangers';
import { db } from '@/lib/firebase';
import { Coordinate, fetchSafeRoute, RouteResult } from '@/lib/routing';
import { conversationId } from '@/lib/users';

const KCL_CAMPUSES = [
  { name: "Guy's Campus", coord: { latitude: 51.5037, longitude: -0.0877 }, security: 'KCL Security — Guy\'s' },
  { name: 'Strand Campus', coord: { latitude: 51.5115, longitude: -0.1160 }, security: 'KCL Security — Strand' },
];

function nearestCampus(loc: Coordinate) {
  return KCL_CAMPUSES.reduce((best, c) => {
    const d = Math.hypot(c.coord.latitude - loc.latitude, c.coord.longitude - loc.longitude);
    const bd = Math.hypot(best.coord.latitude - loc.latitude, best.coord.longitude - loc.longitude);
    return d < bd ? c : best;
  });
}

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
  const [dangers, setDangers] = useState<Danger[]>([]);
  const [reportCoord, setReportCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [reportType, setReportType] = useState<DangerType>('unsafe_area');
  const [reportDesc, setReportDesc] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedDanger, setSelectedDanger] = useState<Danger | null>(null);
  const [showCampusSheet, setShowCampusSheet] = useState(false);
  const [campusAlertLoading, setCampusAlertLoading] = useState(false);

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
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

  useEffect(() => {
    return subscribeDangers(setDangers);
  }, []);

  async function handleRoute(overrideDest?: Coordinate) {
    const dest = overrideDest ?? destCoord;
    if (!location || !dest) return;
    setLoading(true);
    try {
      const result = await fetchSafeRoute(location, dest, highRiskCrimes(crimePoints));
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
    const routeCoords = route?.coordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })) ?? [];
    const senderName = user.displayName ?? user.email ?? 'Someone';

    // Send a message card + notification to each contact
    await Promise.all(selectedUids.map(async (uid) => {
      const contact = contacts.find((c) => c.uid === uid);
      const cid = conversationId(user.uid, uid);
      await setDoc(doc(db, 'conversations', cid), {
        participants: [user.uid, uid],
        names: {
          [user.uid]: senderName,
          [uid]: contact?.displayName || contact?.email || 'User',
        },
        lastMessage: '📍 Started sharing live location',
        lastSenderUid: user.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await addDoc(collection(db, 'conversations', cid, 'messages'), {
        uid: user.uid,
        type: 'location_share',
        text: '📍 Started sharing live location',
        senderName,
        createdAt: serverTimestamp(),
      });
      // Notification fires on the recipient's device via their conversation onSnapshot listener
    }));

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      async (loc) => {
        if (!user) return;
        for (const uid of selectedUids) {
          await setDoc(doc(db, 'locationShares', `${user.uid}_${uid}`), {
            uid: user.uid,
            displayName: senderName,
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
      // 1. Write SOS doc (existing behaviour)
      await setDoc(doc(db, 'sos', user.uid), {
        uid: user.uid,
        displayName: user.displayName ?? 'Anonymous',
        latitude: location.latitude,
        longitude: location.longitude,
        sentAt: serverTimestamp(),
      });

      // 2. Send a location card message to every contact's conversation
      const senderName = user.displayName ?? user.email ?? 'Someone';
      await Promise.all(contacts.map(async (contact) => {
        const cid = conversationId(user.uid, contact.uid);
        // Ensure conversation doc exists
        await setDoc(doc(db, 'conversations', cid), {
          participants: [user.uid, contact.uid],
          names: {
            [user.uid]: senderName,
            [contact.uid]: contact.displayName || contact.email,
          },
          lastMessage: '🆘 SOS — shared location',
          lastSenderUid: user.uid,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        // Add SOS message card
        await addDoc(collection(db, 'conversations', cid, 'messages'), {
          uid: user.uid,
          type: 'sos',
          text: '🆘 SOS — shared location',
          latitude: location.latitude,
          longitude: location.longitude,
          senderName,
          createdAt: serverTimestamp(),
        });
        // Notification fires on the recipient's device via their conversation onSnapshot listener
      }));

      Alert.alert('SOS Sent', 'Your location has been sent to all your contacts.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSosLoading(false);
    }
  }

  async function submitReport() {
    if (!user || !reportCoord) return;
    setReportLoading(true);
    try {
      await reportDanger(
        reportCoord.lat, reportCoord.lng,
        reportType, reportDesc,
        user.uid, user.displayName ?? user.email ?? 'Anonymous'
      );
      setReportCoord(null);
      setReportDesc('');
      setReportType('unsafe_area');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setReportLoading(false);
    }
  }

  async function routeToCampus() {
    if (!location) { Alert.alert('No location', 'Waiting for GPS fix.'); return; }
    const campus = nearestCampus(location);
    setShowCampusSheet(false);
    setLoading(true);
    try {
      const result = await fetchSafeRoute(location, campus.coord, highRiskCrimes(crimePoints));
      setRoute(result);
      setDestCoord(campus.coord);
    } catch (e: any) {
      Alert.alert('Routing error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function alertCampusSecurity() {
    if (!user || !location) { Alert.alert('No location', 'Waiting for GPS fix.'); return; }
    setCampusAlertLoading(true);
    try {
      const campus = nearestCampus(location);
      await addDoc(collection(db, 'securityAlerts'), {
        uid: user.uid,
        displayName: user.displayName ?? user.email ?? 'Anonymous',
        latitude: location.latitude,
        longitude: location.longitude,
        campus: campus.name,
        sentAt: serverTimestamp(),
      });
      setShowCampusSheet(false);
      Alert.alert('Security Alerted', `${campus.security} has been notified with your location.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCampusAlertLoading(false);
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
        sharing={sharing}
        dangers={dangers.map((d) => ({ ...d, icon: DANGER_ICONS[d.type] }))}
        onCrimeData={(points) => setCrimePoints(points)}
        onMapLongPress={(lat, lng) => setReportCoord({ lat, lng })}
        onDangerTap={(id) => setSelectedDanger(dangers.find((d) => d.id === id) ?? null)}
      />

      <DestinationSearch
        onSelect={(coord) => setDestCoord(coord)}
        onSubmit={handleRoute}
        loading={loading}
      />

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.circleBtn, { backgroundColor: showHeatmap ? '#FF9500' : 'rgba(0,0,0,0.45)' }]}
          onPress={() => setShowHeatmap((v) => !v)}
          activeOpacity={0.8}>
          <Ionicons name="flame" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pillBtn, { backgroundColor: sharing ? '#34C759' : '#ff8500' }]}
          onPress={toggleSharing}
          activeOpacity={0.8}>
          <Ionicons name={sharing ? 'navigate' : 'navigate-outline'} size={18} color="#fff" />
          <Text style={styles.pillBtnText}>{sharing ? `Sharing (${sharingWith.size})` : 'Share Journey'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.circleBtn, { backgroundColor: '#FF3B30' }]}
          onPress={sendSOS}
          disabled={sosLoading}
          activeOpacity={0.8}>
          {sosLoading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.sosBtnText}>SOS</Text>}
        </TouchableOpacity>
      </View>

      {/* Floating report button above the bar */}
      <TouchableOpacity
        style={styles.reportFab}
        onPress={() => {
          if (location) setReportCoord({ lat: location.latitude, lng: location.longitude });
          else Alert.alert('No location', 'Waiting for GPS fix.');
        }}
        activeOpacity={0.8}>
        <Ionicons name="warning-outline" size={22} color="#fff" />
      </TouchableOpacity>

      {/* Floating campus button above the bar (left side) */}
      <TouchableOpacity
        style={styles.campusFab}
        onPress={() => setShowCampusSheet(true)}
        activeOpacity={0.8}>
        <Ionicons name="school-outline" size={20} color="#fff" />
      </TouchableOpacity>

      {route && (
        <View style={[styles.routeBar, { backgroundColor: colors.background }]}>
          <Ionicons name="walk-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.routeInfo, { color: colors.textSecondary }]}>
            {km} km · {mins} min · Main roads
          </Text>
          <TouchableOpacity
            onPress={() => { setRoute(null); setDestCoord(null); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      <ContactPickerModal
        visible={showSharePicker}
        contacts={contacts}
        colors={colors}
        onConfirm={startSharingWith}
        onCancel={() => setShowSharePicker(false)}
      />

      {/* Report danger sheet */}
      <Modal visible={!!reportCoord} transparent animationType="slide">
        <View style={sheetStyles.overlay} pointerEvents="box-none">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setReportCoord(null)} />
          <View style={[sheetStyles.sheet, { backgroundColor: colors.background }]}>
            <Text style={[sheetStyles.title, { color: colors.text }]}>Report a Danger</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {(Object.keys(DANGER_LABELS) as DangerType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setReportType(t)}
                  style={[dangerStyles.typeChip, reportType === t && dangerStyles.typeChipActive]}>
                  <Text style={{ fontSize: 16 }}>{DANGER_ICONS[t]}</Text>
                  <Text style={[dangerStyles.typeChipText, reportType === t && { color: '#fff' }]}>
                    {DANGER_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[dangerStyles.input, { color: colors.text, borderColor: colors.backgroundElement }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.textSecondary}
              value={reportDesc}
              onChangeText={setReportDesc}
              multiline
              numberOfLines={3}
            />
            <View style={sheetStyles.btns}>
              <TouchableOpacity style={sheetStyles.cancelBtn} onPress={() => setReportCoord(null)}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sheetStyles.confirmBtn, reportLoading && { opacity: 0.6 }]}
                onPress={submitReport}
                disabled={reportLoading}>
                {reportLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Report</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Danger detail sheet */}
      <Modal visible={!!selectedDanger} transparent animationType="slide">
        <View style={sheetStyles.overlay} pointerEvents="box-none">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSelectedDanger(null)} />
          <View style={[sheetStyles.sheet, { backgroundColor: colors.background }]}>
            {selectedDanger && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Text style={{ fontSize: 32 }}>{DANGER_ICONS[selectedDanger.type]}</Text>
                  <Text style={[sheetStyles.title, { color: colors.text, marginBottom: 0 }]}>
                    {DANGER_LABELS[selectedDanger.type]}
                  </Text>
                </View>
                {!!selectedDanger.description && (
                  <Text style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
                    {selectedDanger.description}
                  </Text>
                )}
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  Reported by {selectedDanger.reportedByName}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
                  {new Date(selectedDanger.reportedAt).toLocaleString()}
                </Text>
                <TouchableOpacity
                  style={dangerStyles.upvoteBtn}
                  onPress={async () => { await upvoteDanger(selectedDanger.id); setSelectedDanger(null); }}>
                  <Ionicons name="thumbs-up-outline" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm ({selectedDanger.upvotes})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[sheetStyles.cancelBtn, { marginTop: 8 }]} onPress={() => setSelectedDanger(null)}>
                  <Text style={{ color: colors.textSecondary }}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
      {/* Campus security sheet */}
      <Modal visible={showCampusSheet} transparent animationType="slide">
        <View style={sheetStyles.overlay} pointerEvents="box-none">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowCampusSheet(false)} />
          <View style={[sheetStyles.sheet, { backgroundColor: colors.background }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Ionicons name="school" size={24} color="#1a73e8" />
              <Text style={[sheetStyles.title, { color: colors.text, marginBottom: 0 }]}>KCL Campus Security</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
              {location ? `Nearest: ${nearestCampus(location).name}` : 'Getting your location...'}
            </Text>

            <TouchableOpacity
              style={[campusStyles.optionBtn, { backgroundColor: '#1a73e8' }]}
              onPress={routeToCampus}
              disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="navigate-outline" size={20} color="#fff" />
                    <Text style={campusStyles.optionText}>Route to Nearest Campus</Text>
                  </>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[campusStyles.optionBtn, { backgroundColor: '#FF3B30' }]}
              onPress={alertCampusSecurity}
              disabled={campusAlertLoading}>
              {campusAlertLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                    <Text style={campusStyles.optionText}>Alert Campus Security</Text>
                  </>}
            </TouchableOpacity>

            <TouchableOpacity style={sheetStyles.cancelBtn} onPress={() => setShowCampusSheet(false)}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionBar: {
    position: 'absolute',
    bottom: 24,
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportFab: {
    position: 'absolute',
    bottom: 92,
    right: Spacing.three,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8a020',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  campusFab: {
    position: 'absolute',
    bottom: 92,
    left: Spacing.three,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  circleBtn: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  sosBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  pillBtn: {
    flex: 1, height: 56, borderRadius: 28,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pillBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  routeBar: {
    position: 'absolute', bottom: 92,
    left: Spacing.three, right: Spacing.three,
    borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: 7,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.one,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4,
  },
  routeInfo: { flex: 1, fontSize: 13 },
});

const campusStyles = StyleSheet.create({
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: Spacing.three,
    borderRadius: 12, marginBottom: 10,
  },
  optionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.two, borderRadius: 10, gap: Spacing.two },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ff8500', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  name: { flex: 1, fontSize: 15 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: '#ff8500', borderColor: '#ff8500' },
  btns: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  cancelBtn: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center' },
  confirmBtn: { flex: 1, backgroundColor: '#ff8500', paddingVertical: Spacing.two, borderRadius: 10, alignItems: 'center' },
});

const dangerStyles = StyleSheet.create({
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#ccc',
  },
  typeChipActive: { backgroundColor: '#ff8500', borderColor: '#ff8500' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  input: {
    borderWidth: 1, borderRadius: 10, padding: 10,
    fontSize: 14, minHeight: 70, textAlignVertical: 'top', marginBottom: 12,
  },
  upvoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ff8500', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, alignSelf: 'flex-start',
  },
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
      <View style={sheetStyles.overlay}>
        <View style={[sheetStyles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[sheetStyles.title, { color: colors.text }]}>Share journey with</Text>
          {contacts.map((c) => (
            <TouchableOpacity
              key={c.uid}
              style={[sheetStyles.row, { backgroundColor: colors.backgroundElement }]}
              onPress={() => toggle(c.uid)}>
              <View style={sheetStyles.avatar}>
                <Text style={sheetStyles.avatarText}>{(c.displayName || c.email)[0].toUpperCase()}</Text>
              </View>
              <Text style={[sheetStyles.name, { color: colors.text }]}>{c.displayName || c.email}</Text>
              <View style={[sheetStyles.check, selected.has(c.uid) && sheetStyles.checkActive]}>
                {selected.has(c.uid) && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}
          <View style={sheetStyles.btns}>
            <TouchableOpacity style={sheetStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sheetStyles.confirmBtn, selected.size === 0 && { opacity: 0.4 }]}
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
