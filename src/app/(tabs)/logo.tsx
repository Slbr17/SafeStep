import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
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

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  time: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    text: "Hello, you're connected to KCL Security. How can we help you today?",
    fromMe: false,
    time: now(),
  },
];

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const AUTO_REPLIES = [
  "Thanks for reaching out. An officer has been notified.",
  "We're looking into this now. Please stay where you are if it's safe to do so.",
  "Can you provide more details about your location?",
  "A security officer is on their way. Stay on the line.",
];

export default function KCLSecurityChat() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);
  const replyIndex = useRef(0);

  function send() {
    if (!text.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), text: text.trim(), fromMe: true, time: now() };
    setMessages((prev) => [...prev, userMsg]);
    setText('');

    // Simulate a reply after a short delay
    setTimeout(() => {
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        text: AUTO_REPLIES[replyIndex.current % AUTO_REPLIES.length],
        fromMe: false,
        time: now(),
      };
      replyIndex.current += 1;
      setMessages((prev) => [...prev, reply]);
      listRef.current?.scrollToEnd({ animated: true });
    }, 1200);

    listRef.current?.scrollToEnd({ animated: true });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.backgroundElement }]}>
        <View style={styles.headerAvatar}>
          <Ionicons name="shield-checkmark" size={20} color="#ff8500" />
        </View>
        <View>
          <Text style={[styles.headerName, { color: colors.text }]}>KCL Security</Text>
          <Text style={[styles.headerStatus, { color: '#34C759' }]}>● Online</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.fromMe && styles.bubbleRowMe]}>
            <View style={[
              styles.bubble,
              item.fromMe
                ? styles.bubbleMe
                : [styles.bubbleThem, { backgroundColor: colors.backgroundElement }],
            ]}>
              <Text style={[styles.bubbleText, { color: item.fromMe ? '#fff' : colors.text }]}>
                {item.text}
              </Text>
              <Text style={[styles.bubbleTime, { color: item.fromMe ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
                {item.time}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Input */}
      <View style={[styles.inputRow, { backgroundColor: colors.backgroundElement }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Message KCL Security..."
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          returnKeyType="send"
          onSubmitEditing={send}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
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
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3c096c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerName: { fontWeight: '700', fontSize: 16 },
  headerStatus: { fontSize: 12 },
  messageList: { padding: Spacing.three, gap: Spacing.two },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: Spacing.two, gap: 4 },
  bubbleMe: { backgroundColor: '#ff8500', borderBottomRightRadius: 2 },
  bubbleThem: { borderBottomLeftRadius: 2 },
  bubbleText: { fontSize: 15 },
  bubbleTime: { fontSize: 11, alignSelf: 'flex-end' },
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
