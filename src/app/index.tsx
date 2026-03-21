import * as Location from 'expo-location';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import { LeafletMap } from '@/components/leaflet-map';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { Coordinate, fetchSafeRoute, RouteResult } from '@/lib/routing';

export default function MapScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const [location, setLocation] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState('');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);

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

  async function handleRoute() {
    if (!location || !destination.trim()) return;
    setLoading(true);
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'SafeStep/1.0' } }
      );
      const geoData = await geoRes.json();
      if (!geoData.length) {
        Alert.alert('Not found', 'Could not find that destination.');
        return;
      }
      const dest: Coordinate = {
        latitude: parseFloat(geoData[0].lat),
        longitude: parseFloat(geoData[0].lon),
      };
      const result = await fetchSafeRoute(location, dest);
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
      await deleteDoc(doc(db, 'journeys', user.uid));
      setSharing(false);
    } else {
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        async (loc) => {
          if (!user) return;
          await setDoc(doc(db, 'journeys', user.uid), {
            uid: user.uid,
            displayName: user.displayName ?? 'Anonymous',
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            updatedAt: serverTimestamp(),
          });
        }
      );
      setSharing(true);
    }
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
      <LeafletMap location={location} routeCoords={route?.coordinates ?? []} />

      <View style={[styles.searchBar, { backgroundColor: colors.background }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Where to?"
          placeholderTextColor={colors.textSecondary}
          value={destination}
          onChangeText={setDestination}
          onSubmitEditing={handleRoute}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.goBtn} onPress={handleRoute} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.goBtnText}>Go</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.bottomSheet, { backgroundColor: colors.background }]}>
        {route && (
          <Text style={[styles.routeInfo, { color: colors.textSecondary }]}>
            {km} km · {mins} min · Main roads preferred
          </Text>
        )}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: sharing ? '#34C759' : colors.backgroundElement },
            ]}
            onPress={toggleSharing}>
            <Text style={[styles.actionBtnText, { color: sharing ? '#fff' : colors.text }]}>
              {sharing ? 'Sharing Live' : 'Share Journey'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sosBtn} onPress={sendSOS} disabled={sosLoading}>
            {sosLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sosBtnText}>SOS</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    position: 'absolute',
    top: 56,
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    gap: Spacing.two,
  },
  input: { flex: 1, fontSize: 16 },
  goBtn: {
    backgroundColor: '#ff8500',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  goBtnText: { color: '#fff', fontWeight: '600' },
  bottomSheet: {
    position: 'absolute',
    bottom: 90,
    left: Spacing.three,
    right: Spacing.three,
    borderRadius: 16,
    padding: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    gap: Spacing.two,
  },
  routeInfo: { fontSize: 14, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnText: { fontWeight: '600', fontSize: 15 },
  sosBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
