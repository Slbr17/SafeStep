import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
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
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';

interface SecurityMessage {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: any;
  fromSecurity?: boolean;
}

export default function SecurityScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const listRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<SecurityMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'securityMessages', user.uid, 'thread'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SecurityMessage)));
    });
  }, [user]);

  async function autoReply(isAlert = false) {
    if (!user) return;
    const replies = isAlert
      ? [
          '🚨 Alert received — an officer is on their way to your location now.\n\nIf you need immediate police assistance call 999. For non-emergency police contact 101.\n\nKCL Security direct line: 020 7848 3333 (24/7)',
          '🚨 We have your location. Stay where you are and keep this app open.\n\nEmergency: 999 | KCL Security: 020 7848 3333\n\nA member of our team will reach you shortly.',
          '🚨 Alert acknowledged. Please stay calm and move to a well-lit public area if safe to do so.\n\nKCL Security (24/7): 020 7848 3333\nEmergency services: 999',
        ]
      : [
          'Hi, thanks for contacting KCL Security. A member of our team will respond shortly.\n\nFor urgent matters please call us directly:\n📞 020 7848 3333 (24/7)\n\nEmergency services: 999',
          'Hello — KCL Security here. We\'ve received your message and will get back to you as soon as possible.\n\nNeed immediate help?\n📞 KCL Security: 020 7848 3333\n🚔 Police (non-emergency): 101\n🚨 Emergency: 999',
          'Thanks for getting in touch. Our security team covers all KCL campuses around the clock.\n\n📞 24/7 Security line: 020 7848 3333\n🏥 Guy\'s Campus reception: 020 7188 7188\n\nHow can we help?',
          'Message received. We\'re here to help — please don\'t hesitate to share more details.\n\nUseful contacts:\n📞 KCL Security: 020 7848 3333\n📞 Student Services: 020 7848 7070\n🚨 Emergency: 999',
        ];
    const text = replies[Math.floor(Math.random() * replies.length)];
    await addDoc(collection(db, 'securityMessages', user.uid, 'thread'), {
      uid: 'kcl_security',
      displayName: 'KCL Security',
      text,
      fromSecurity: true,
      createdAt: serverTimestamp(),
    });
  }

  async function send() {
    if (!text.trim() || !user || sending) return;
    const msg = text.trim();
    setText('');
    setSending(true);
    try {
      await addDoc(collection(db, 'securityMessages', user.uid, 'thread'), {
        uid: user.uid,
        displayName: user.displayName ?? user.email ?? 'Student',
        text: msg,
        fromSecurity: false,
        createdAt: serverTimestamp(),
      });
      // Auto-reply after a short delay to simulate a response
      setTimeout(() => autoReply(false), 1500 + Math.random() * 1000);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: '#ff8500' }]}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark" size={22} color="#fff" />
        </View>
        <View>
          <Text style={styles.headerTitle}>KCL Security</Text>
          <Text style={styles.headerSub}>Campus Safety Team</Text>
        </View>
        <View style={styles.onlineDot} />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="shield-checkmark-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>KCL Security</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Send a message to campus security. They can see your messages and respond.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = !item.fromSecurity;
          if (item.type === 'alert') {
            return (
              <View style={styles.alertCard}>
                <View style={styles.alertCardHeader}>
                  <Text style={styles.alertCardIcon}>🚨</Text>
                  <Text style={styles.alertCardTitle}>Security Alert Sent</Text>
                </View>
                <Text style={styles.alertCardText}>{item.text}</Text>
              </View>
            );
          }
          return (
            <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
              {!isMe && (
                <View style={styles.secAvatar}>
                  <Ionicons name="shield-checkmark" size={14} color="#fff" />
                </View>
              )}
              <View style={[
                styles.bubble,
                isMe
                  ? styles.bubbleMe
                  : [styles.bubbleThem, { backgroundColor: colors.backgroundElement }],
              ]}>
                <Text style={[styles.msgText, { color: isMe ? '#fff' : colors.text }]}>
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {/* Input */}
      <View style={[styles.inputWrap, { backgroundColor: colors.background }]}>
        <View style={[styles.inputRow, { backgroundColor: colors.backgroundElement }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Message KCL Security..."
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
            onPress={send}
            disabled={!text.trim() || sending}>
            <Ionicons name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: Spacing.three,
    gap: 12,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  onlineDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#34C759',
    marginLeft: 'auto',
    borderWidth: 2, borderColor: '#fff',
  },
  list: { padding: Spacing.three, gap: 8, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  rowMe: { justifyContent: 'flex-end' },
  rowThem: { justifyContent: 'flex-start' },
  secAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#ff8500',
    alignItems: 'center', justifyContent: 'center',
  },
  alertCard: {
    backgroundColor: '#FF3B30',
    borderRadius: 14,
    padding: Spacing.two,
    marginVertical: 2,
    gap: 6,
  },
  alertCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertCardIcon: { fontSize: 18 },
  alertCardTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  alertCardText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },
  bubble: { maxWidth: '75%', padding: Spacing.two, borderRadius: 14 },
  bubbleMe: { backgroundColor: '#ff8500', borderBottomRightRadius: 2 },
  bubbleThem: { borderBottomLeftRadius: 2 },
  msgText: { fontSize: 15 },
  inputWrap: { paddingHorizontal: Spacing.three, paddingVertical: 10, paddingBottom: 16 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: Spacing.two, paddingVertical: Spacing.one,
    borderRadius: 28, gap: Spacing.one,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  input: { flex: 1, fontSize: 15, maxHeight: 100, paddingVertical: 8, paddingHorizontal: Spacing.one },
  sendBtn: {
    backgroundColor: '#ff8500', width: 36, height: 36,
    borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
});
