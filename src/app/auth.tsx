import { Ionicons } from '@expo/vector-icons';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
} from 'firebase/auth';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useColorScheme,
    View,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { auth } from '@/lib/firebase';

export default function AuthScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    if (isSignup && !name.trim()) {
      Alert.alert('Error', 'Please enter your name.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isSignup ? '#fff7f0' : colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* Top accent strip for sign up */}
      {isSignup && <View style={styles.accentStrip} />}

      <View style={styles.inner}>
        {/* Logo / brand */}
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/android-icon.jpeg')}
            style={styles.logoImage}
            resizeMode="cover"
          />
          <Text style={[styles.title, { color: isSignup ? '#ff8500' : colors.text }]}>SafeStep</Text>
        </View>

        {isSignup ? (
          <View style={styles.signupHeader}>
            <Text style={styles.signupHeading}>Create your account</Text>
            <Text style={styles.signupSub}>Join SafeStep and walk with confidence</Text>
          </View>
        ) : (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Welcome back — sign in to continue
          </Text>
        )}

        <View style={[styles.card, { backgroundColor: isSignup ? '#fff' : colors.backgroundElement }]}>
          {isSignup && (
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color="#aaa" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Full name"
                placeholderTextColor="#aaa"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={18} color="#aaa" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Email"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={[styles.inputRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#aaa" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Password"
              placeholderTextColor="#aaa"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isSignup && styles.primaryBtnSignup]}
          onPress={handleSubmit}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {isSignup ? 'Create Account' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchBtn}
          onPress={() => { setMode(isSignup ? 'login' : 'signup'); setName(''); }}>
          <Text style={[styles.switchText, { color: colors.textSecondary }]}>
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={styles.switchLink}>
              {isSignup ? 'Sign in' : 'Sign up'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  accentStrip: {
    height: 6,
    backgroundColor: '#ff8500',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 4,
  },
  logoImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  title: { fontSize: 36, fontWeight: '800' },
  subtitle: { fontSize: 15, textAlign: 'center' },
  signupHeader: { alignItems: 'center', gap: 4 },
  signupHeading: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  signupSub: { fontSize: 14, color: '#888' },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: '#ff8500',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnSignup: {
    backgroundColor: '#ff8500',
    shadowColor: '#ff8500',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchBtn: { alignItems: 'center' },
  switchText: { fontSize: 14 },
  switchLink: { color: '#ff8500', fontWeight: '700' },
});
