import { updateProfile } from 'firebase/auth';
import React, { useState } from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { auth } from '@/lib/firebase';

export default function ProfileScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [name, setName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  async function saveName() {
    if (!auth.currentUser || !name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name.trim() });
      Alert.alert('Saved', 'Display name updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Profile</Text>

      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.displayName ?? 'A')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.uid, { color: colors.textSecondary }]}>
          ID: {user?.uid?.slice(0, 8)}...
        </Text>
      </View>

      <View style={[styles.section, { backgroundColor: colors.backgroundElement }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Display Name</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.backgroundSelected }]}
          value={name}
          onChangeText={setName}
          placeholder="Enter your name"
          placeholderTextColor={colors.textSecondary}
        />
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={saveName}
          disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: colors.backgroundElement }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>About SafeStep</Text>
        <Text style={[styles.about, { color: colors.text }]}>
          SafeStep routes you through main roads and lets you share your journey in real time with
          trusted contacts. Use SOS to alert contacts instantly.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, paddingHorizontal: Spacing.three, gap: Spacing.three },
  title: { fontSize: 24, fontWeight: '700' },
  card: {
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ff8500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  uid: { fontSize: 13 },
  section: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  saveBtn: {
    backgroundColor: '#ff8500',
    paddingVertical: Spacing.two,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  about: { fontSize: 14, lineHeight: 20 },
});
