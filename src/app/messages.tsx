import {
    addDoc,
    collection,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';

interface Message {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: any;
}

// Global chat room for prototype — extend to 1:1 DMs later
export default function MessagesScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const listRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
    });
    return unsub;
  }, []);

  async function send() {
    if (!text.trim() || !user) return;
    const msg = text.trim();
    setText('');
    await addDoc(collection(db, 'messages'), {
      uid: user.uid,
      displayName: user.displayName ?? 'Anonymous',
      text: msg,
      createdAt: serverTimestamp(),
    });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <Text style={[styles.title, { color: colors.text }]}>Messages</Text>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMe = item.uid === user?.uid;
          return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              {!isMe && (
                <Text style={[styles.sender, { color: colors.textSecondary }]}>
                  {item.displayName}
                </Text>
              )}
              <Text style={[styles.msgText, { color: isMe ? '#fff' : colors.text }]}>
                {item.text}
              </Text>
            </View>
          );
        }}
      />

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
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', paddingHorizontal: Spacing.three, marginBottom: Spacing.two },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  bubble: {
    maxWidth: '75%',
    padding: Spacing.two,
    borderRadius: 12,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#ff8500',
    borderBottomRightRadius: 2,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 2,
  },
  sender: { fontSize: 11, marginBottom: 2 },
  msgText: { fontSize: 15 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.two,
    gap: Spacing.two,
    marginBottom: Platform.OS === 'ios' ? 0 : Spacing.two,
  },
  input: { flex: 1, fontSize: 15, maxHeight: 100, paddingVertical: Spacing.one },
  sendBtn: {
    backgroundColor: '#ff8500',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  sendBtnText: { color: '#fff', fontWeight: '600' },
});
