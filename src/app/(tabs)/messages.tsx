import { Ionicons } from '@expo/vector-icons';
import {
    addDoc, collection, doc, onSnapshot,
    orderBy, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    FlatList, KeyboardAvoidingView, Platform,
    StyleSheet, Text, TextInput, TouchableOpacity,
    useColorScheme, View,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { showMessageNotification } from '@/lib/notifications';
import { conversationId } from '@/lib/users';

interface Contact { uid: string; email: string; displayName: string; }
interface Conversation { id: string; otherUid: string; otherName: string; lastMessage: string; updatedAt: any; }
interface Message { id: string; uid: string; text: string; createdAt: any; }

export default function MessagesScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [view, setView] = useState<'list' | 'thread'>('list');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  // My contacts (to start new DMs)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'contacts'), where('ownerUid', '==', user.uid));
    return onSnapshot(q, (snap) => setContacts(snap.docs.map((d) => d.data() as Contact & { ownerUid: string })));
  }, [user]);

  const lastConvUpdated = useRef<Record<string, string>>({});

  // Conversations where I'm a participant
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid));
    return onSnapshot(q, (snap) => {
      const convs = snap.docs.map((d) => {
        const data = d.data();
        const otherUid = data.participants.find((p: string) => p !== user.uid);
        return {
          id: d.id,
          otherUid,
          otherName: data.names?.[otherUid] ?? 'Unknown',
          lastMessage: data.lastMessage ?? '',
          updatedAt: data.updatedAt,
          lastSenderUid: data.lastSenderUid,
        } as Conversation & { lastSenderUid?: string };
      });
      convs.sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
      setConversations(convs);

      // Notify for new messages on conversations not currently open
      for (const c of convs) {
        const key = c.id;
        const ts = c.updatedAt?.seconds?.toString() ?? '';
        const isActiveThread = view === 'thread' && activeConv?.id === c.id;
        const isFromMe = (c as any).lastSenderUid === user.uid;
        if (
          ts &&
          lastConvUpdated.current[key] !== undefined &&
          lastConvUpdated.current[key] !== ts &&
          !isActiveThread &&
          !isFromMe &&
          c.lastMessage
        ) {
          showMessageNotification(c.otherName, c.lastMessage);
        }
        lastConvUpdated.current[key] = ts;
      }
    });
  }, [user, view, activeConv]);

  const lastMessageId = useRef<string | null>(null);

  // Messages in active thread
  useEffect(() => {
    if (!activeConv) return;
    const q = query(
      collection(db, 'conversations', activeConv.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      // Notify on new incoming messages (not our own, not on first load)
      const latest = msgs[msgs.length - 1];
      if (latest && latest.id !== lastMessageId.current && latest.uid !== user?.uid) {
        if (lastMessageId.current !== null) {
          // Only notify if we've already seen at least one message (not initial load)
          showMessageNotification(activeConv.otherName, latest.text);
        }
        lastMessageId.current = latest.id;
      } else if (latest) {
        lastMessageId.current = latest.id;
      }
    });
  }, [activeConv]);

  async function openOrCreateConversation(contact: Contact) {
    if (!user) return;
    const cid = conversationId(user.uid, contact.uid);
    await setDoc(doc(db, 'conversations', cid), {
      participants: [user.uid, contact.uid],
      names: {
        [user.uid]: user.displayName ?? user.email ?? 'Me',
        [contact.uid]: contact.displayName || contact.email,
      },
      lastMessage: '',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setActiveConv({
      id: cid,
      otherUid: contact.uid,
      otherName: contact.displayName || contact.email,
      lastMessage: '',
      updatedAt: null,
    });
    setView('thread');
  }

  async function send() {
    if (!text.trim() || !user || !activeConv) return;
    const msg = text.trim();
    setText('');
    await addDoc(collection(db, 'conversations', activeConv.id, 'messages'), {
      uid: user.uid,
      text: msg,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'conversations', activeConv.id), {
      lastMessage: msg,
      lastSenderUid: user.uid,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  if (view === 'thread' && activeConv) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setView('list'); setActiveConv(null); setMessages([]); }}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{activeConv.otherName[0]?.toUpperCase()}</Text>
          </View>
          <Text style={[styles.headerName, { color: colors.text }]}>{activeConv.otherName}</Text>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.list, { paddingBottom: 80 }]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMe = item.uid === user?.uid;
            return (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : [styles.bubbleThem, { backgroundColor: colors.backgroundElement }]]}>
                <Text style={[styles.msgText, { color: isMe ? '#fff' : colors.text }]}>{item.text}</Text>
              </View>
            );
          }}
        />

        {/* Floating input bar */}
        <View style={styles.inputWrap}>
          <View style={[styles.inputRow, { backgroundColor: colors.backgroundElement }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Message..."
              placeholderTextColor={colors.textSecondary}
              value={text}
              onChangeText={setText}
              onSubmitEditing={send}
              returnKeyType="send"
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} onPress={send}>
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Messages</Text>

      {/* Start new DM from contacts */}
      {contacts.length > 0 && (
        <View style={styles.newDmRow}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>New message</Text>
          <FlatList
            horizontal
            data={contacts}
            keyExtractor={(c) => c.uid}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Spacing.two, paddingHorizontal: Spacing.three }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.contactChip} onPress={() => openOrCreateConversation(item)}>
                <View style={styles.chipAvatar}>
                  <Text style={styles.chipAvatarText}>{(item.displayName || item.email)[0].toUpperCase()}</Text>
                </View>
                <Text style={[styles.chipName, { color: colors.text }]} numberOfLines={1}>
                  {item.displayName || item.email}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No messages yet. Start a conversation from your contacts.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.convCard, { backgroundColor: colors.backgroundElement }]}
            onPress={() => { setActiveConv(item); setView('thread'); }}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.otherName[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>{item.otherName}</Text>
              <Text style={[styles.lastMsg, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.lastMessage || 'No messages yet'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', paddingHorizontal: Spacing.three, marginBottom: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ff8500', alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: '#fff', fontWeight: '700' },
  headerName: { fontSize: 17, fontWeight: '600' },
  sectionLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: Spacing.three, marginBottom: 8 },
  newDmRow: { marginBottom: Spacing.two },
  contactChip: { alignItems: 'center', gap: 4, width: 64 },
  chipAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ff8500', alignItems: 'center', justifyContent: 'center' },
  chipAvatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  chipName: { fontSize: 11, textAlign: 'center' },
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  convCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, borderRadius: 12, gap: Spacing.two },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ff8500', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 20 },
  name: { fontWeight: '600', fontSize: 15 },
  lastMsg: { fontSize: 13, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: Spacing.six, fontSize: 15 },
  bubble: { maxWidth: '75%', padding: Spacing.two, borderRadius: 12 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#ff8500', borderBottomRightRadius: 2 },
  bubbleThem: { alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
  msgText: { fontSize: 15 },
  inputWrap: {
    position: 'absolute',
    bottom: 12,
    left: Spacing.three,
    right: Spacing.three,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 28,
    gap: Spacing.one,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  input: { flex: 1, fontSize: 15, maxHeight: 100, paddingVertical: 8, paddingHorizontal: Spacing.one },
  sendBtn: { backgroundColor: '#ff8500', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
