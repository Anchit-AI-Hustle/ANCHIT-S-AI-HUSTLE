import { useChat } from '@ai-sdk/react';
import { Ionicons } from '@expo/vector-icons';
import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AGENTS, API_BASE, CHAT_ENDPOINT, type AgentId } from '@/constants/vahdam';
import { useBrandTheme } from '@/lib/theme';

function partsToText(parts: any[]): string {
  return parts
    .filter((p) => p?.type === 'text')
    .map((p) => p.text)
    .join('');
}

function usedTools(parts: any[]): string[] {
  return parts
    .filter((p) => typeof p?.type === 'string' && p.type.startsWith('tool-'))
    .map((p) => p.type.replace(/^tool-/, ''));
}

export default function AssistantScreen() {
  const t = useBrandTheme();
  const insets = useSafeAreaInsets();
  const [personaId, setPersonaId] = useState<AgentId>('concierge');
  const personaRef = useRef<AgentId>('concierge');
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  const transport = useRef(
    new DefaultChatTransport({
      api: CHAT_ENDPOINT,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: { messages, persona: personaRef.current, ...body },
      }),
    }),
  ).current;

  const { messages, sendMessage, status, setMessages, error } = useChat({ transport });

  const agent = AGENTS.find((a) => a.id === personaId)!;
  const busy = status === 'submitted' || status === 'streaming';

  function switchPersona(id: AgentId) {
    personaRef.current = id;
    setPersonaId(id);
    setMessages([]);
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Persona selector */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: t.line }]}>
        <Text style={[styles.title, { color: t.text }]}>Assistant</Text>
        <View style={styles.personaRow}>
          {AGENTS.map((a) => {
            const active = a.id === personaId;
            return (
              <Pressable
                key={a.id}
                onPress={() => switchPersona(a.id)}
                style={[
                  styles.persona,
                  { backgroundColor: active ? t.primary : t.surface, borderColor: active ? t.primary : t.line },
                ]}>
                <Ionicons name={a.icon as any} size={15} color={active ? t.onPrimary : t.textSoft} />
                <Text numberOfLines={1} style={{ color: active ? t.onPrimary : t.text, fontWeight: '600', fontSize: 12 }}>
                  {a.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.agentAvatar, { backgroundColor: t.surfaceAlt }]}>
                <Ionicons name={agent.icon as any} size={26} color={t.primary} />
              </View>
              <Text style={[styles.agentName, { color: t.text }]}>{agent.name}</Text>
              <Text style={[styles.greeting, { color: t.textSoft }]}>{agent.greeting}</Text>
              <View style={styles.suggestions}>
                {agent.suggestions.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => send(s)}
                    style={[styles.suggestion, { borderColor: t.line, backgroundColor: t.surface }]}>
                    <Text style={{ color: t.text, fontSize: 13 }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            const text = partsToText(item.parts as any[]);
            const tools = isUser ? [] : usedTools(item.parts as any[]);
            return (
              <View style={[styles.bubbleRow, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
                <View
                  style={[
                    styles.bubble,
                    isUser
                      ? { backgroundColor: t.primary, borderTopRightRadius: 4 }
                      : { backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 4 },
                  ]}>
                  {tools.length > 0 && (
                    <Text style={[styles.toolNote, { color: t.gold }]}>
                      🔧 {tools.join(', ')}
                    </Text>
                  )}
                  <Text style={{ color: isUser ? t.onPrimary : t.text, fontSize: 15, lineHeight: 21 }}>
                    {text || (busy ? '…' : '')}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {busy && (
          <Text style={[styles.typing, { color: t.textSoft }]}>{agent.name} is typing…</Text>
        )}
        {status === 'error' && (
          <Text style={[styles.typing, { color: t.dark ? '#ff8a80' : '#B3261E' }]}>
            {error?.message ?? 'Something went wrong.'}{API_BASE ? '' : ' (no API origin resolved)'}
          </Text>
        )}

        {/* Composer */}
        <View style={[styles.composer, { borderTopColor: t.line, backgroundColor: t.bg, paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={`Message ${agent.name}…`}
            placeholderTextColor={t.textSoft}
            style={[styles.composerInput, { backgroundColor: t.surface, borderColor: t.line, color: t.text }]}
            multiline
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            disabled={!input.trim() || busy}
            onPress={() => send(input)}
            style={[styles.sendBtn, { backgroundColor: input.trim() && !busy ? t.primary : t.line }]}>
            <Ionicons name="arrow-up" size={20} color={input.trim() && !busy ? t.onPrimary : t.textSoft} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  title: { fontSize: 22, fontWeight: '800' },
  personaRow: { flexDirection: 'row', gap: 8 },
  persona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 8 },
  agentAvatar: { width: 60, height: 60, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  agentName: { fontSize: 18, fontWeight: '800' },
  greeting: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  suggestions: { gap: 8, marginTop: 12, alignSelf: 'stretch' },
  suggestion: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  toolNote: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  typing: { fontSize: 12, paddingHorizontal: 18, paddingBottom: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
