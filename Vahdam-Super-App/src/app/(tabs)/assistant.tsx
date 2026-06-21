import { useChat } from '@ai-sdk/react';
import { Ionicons } from '@expo/vector-icons';
import { DefaultChatTransport } from 'ai';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { fetch as expoFetch } from 'expo/fetch';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AGENTS,
  API_BASE,
  CHAT_ENDPOINT,
  MODELS,
  type AgentId,
  type FocusTarget,
  type ModelId,
} from '@/constants/vahdam';
import { CATEGORIES, PRODUCTS } from '@/data/products';
import { detectNavActions, type NavAction } from '@/lib/jarvis';
import { createRecognizer, sttAvailable, type Recognizer } from '@/lib/voice';
import { useBrandTheme } from '@/lib/theme';
import { VoicePicker } from '@/components/voice-picker';
import {
  getSelectedVoice,
  setSelectedVoice,
  voiceServiceConfigured,
} from '@/lib/voiceProfiles';
import { speakWithCloneVoice, type SpeakHandle } from '@/lib/voicePlayer';

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
  const router = useRouter();
  const [personaId, setPersonaId] = useState<AgentId>('concierge');
  const personaRef = useRef<AgentId>('concierge');
  const [modelId, setModelId] = useState<ModelId>('auto');
  const modelRef = useRef<ModelId>('auto');
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const focusRef = useRef<FocusTarget | null>(null);
  const [input, setInput] = useState('');
  const [showModels, setShowModels] = useState(false);
  const [showFocus, setShowFocus] = useState(false);
  const [focusQuery, setFocusQuery] = useState('');
  const listRef = useRef<FlatList>(null);

  // Voice: narration (TTS, cross-platform) + hands-free conversation (STT, web).
  const sttOk = sttAvailable();
  const [autoSpeak, setAutoSpeak] = useState(false);
  const autoSpeakRef = useRef(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const lastSpokenRef = useRef<string | null>(null);

  // Cloned/selectable voice (shared voice service). Falls back to expo-speech.
  const voiceOn = voiceServiceConfigured();
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const selectedVoiceRef = useRef<string | null>(null);
  const [showVoices, setShowVoices] = useState(false);
  const cloneHandleRef = useRef<SpeakHandle | null>(null);

  const transport = useRef(
    new DefaultChatTransport({
      api: CHAT_ENDPOINT,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: {
          messages,
          persona: personaRef.current,
          model: modelRef.current,
          focus: focusRef.current ?? undefined,
          ...body,
        },
      }),
    }),
  ).current;

  const { messages, sendMessage, status, setMessages, error } = useChat({ transport });

  const agent = AGENTS.find((a) => a.id === personaId)!;
  const activeModel = MODELS.find((m) => m.id === modelId)!;
  const busy = status === 'submitted' || status === 'streaming';
  const [showMode, setShowMode] = useState(false);

  // ---- Jarvis navigation ---------------------------------------------------
  function navTo(action: NavAction) {
    router.push(action.href as any);
  }

  // ---- narration -----------------------------------------------------------
  // Load the user's saved voice once (default to Anchit's voice if a service is wired).
  useEffect(() => {
    if (!voiceOn) return;
    (async () => {
      const saved = (await getSelectedVoice()) || 'anchit';
      selectedVoiceRef.current = saved;
      setSelectedVoiceId(saved);
    })();
  }, [voiceOn]);

  function chooseVoice(id: string) {
    selectedVoiceRef.current = id;
    setSelectedVoiceId(id);
    setSelectedVoice(id);
  }

  // After speech ends, resume hands-free listening if in voice mode.
  function onSpokenDone() {
    setSpeakingId(null);
    if (voiceModeRef.current && sttOk) startListening();
  }

  // Device voice (expo-speech) — cross-platform fallback.
  function deviceSpeak(id: string, clean: string) {
    Speech.stop();
    setSpeakingId(id);
    Speech.speak(clean, {
      rate: 1.0,
      onDone: onSpokenDone,
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  }

  function speakText(id: string, text: string) {
    const clean = text.trim();
    if (!clean) return;
    stopSpeak();
    setSpeakingId(id);
    // Prefer the selected cloned/stock voice; fall back to the device voice if
    // the voice service can't synthesize (offline, no GPU, native audio missing).
    if (voiceOn && selectedVoiceRef.current) {
      const handle = speakWithCloneVoice(clean, { voiceId: selectedVoiceRef.current });
      cloneHandleRef.current = handle;
      handle.done
        .then(() => {
          if (cloneHandleRef.current !== handle) return; // superseded/stopped
          cloneHandleRef.current = null;
          onSpokenDone();
        })
        .catch(() => {
          if (cloneHandleRef.current !== handle) return;
          cloneHandleRef.current = null;
          deviceSpeak(id, clean); // nothing played → device voice
        });
      return;
    }
    deviceSpeak(id, clean);
  }
  function stopSpeak() {
    cloneHandleRef.current?.stop();
    cloneHandleRef.current = null;
    Speech.stop();
    setSpeakingId(null);
  }

  // Auto-read each completed assistant reply (and always in voice mode).
  useEffect(() => {
    if (busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || lastSpokenRef.current === last.id) return;
    const text = partsToText(last.parts as any[]);
    if (!text) return;
    if (autoSpeakRef.current || voiceModeRef.current) {
      lastSpokenRef.current = last.id;
      speakText(last.id, text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      Speech.stop();
      recognizerRef.current?.stop();
    };
  }, []);

  // ---- voice input ---------------------------------------------------------
  function startListening() {
    if (!sttOk || busy) return;
    stopSpeak();
    const rec = createRecognizer({
      onPartial: (text) => setPartial(text),
      onResult: (text) => {
        setPartial('');
        send(text);
      },
      onEnd: () => {
        setListening(false);
        recognizerRef.current = null;
      },
      onError: () => {
        setListening(false);
        setPartial('');
      },
    });
    if (!rec) return;
    recognizerRef.current = rec;
    setListening(true);
    rec.start();
  }
  function stopListening() {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setListening(false);
    setPartial('');
  }

  function toggleAutoSpeak() {
    const next = !autoSpeak;
    autoSpeakRef.current = next;
    setAutoSpeak(next);
    if (!next) stopSpeak();
  }
  function toggleVoiceMode() {
    const next = !voiceMode;
    voiceModeRef.current = next;
    setVoiceMode(next);
    if (next) {
      autoSpeakRef.current = true;
      setAutoSpeak(true);
      startListening();
    } else {
      stopListening();
      stopSpeak();
    }
  }

  // Composer reply mode (Option B) — one control over how the agent answers,
  // derived from the existing voice flags:
  //   text  → silent     voice → reply read aloud     call → hands-free conversation
  const replyMode: 'text' | 'voice' | 'call' = voiceMode ? 'call' : autoSpeak ? 'voice' : 'text';
  function setReplyMode(mode: 'text' | 'voice' | 'call') {
    if (mode === 'call') {
      if (!voiceMode) toggleVoiceMode();   // turns on auto-speak + starts listening
      return;
    }
    if (voiceMode) toggleVoiceMode();       // leave hands-free mode
    if (mode === 'voice') { if (!autoSpeak) toggleAutoSpeak(); }
    else { if (autoSpeak) toggleAutoSpeak(); }   // text — silent
  }
  function narrateLast() {
    setShowMode(false);
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    const text = last ? partsToText(last.parts as any[]) : '';
    speakText('narrate', text || 'Ask me about teas, brewing, or your order, and I will help you find the perfect cup.');
  }

  function switchPersona(id: AgentId) {
    personaRef.current = id;
    setPersonaId(id);
    setMessages([]);
    lastSpokenRef.current = null;
    stopSpeak();
    stopListening();
  }
  function switchModel(id: ModelId) {
    modelRef.current = id;
    setModelId(id);
    setShowModels(false);
  }
  function applyFocus(next: FocusTarget | null) {
    focusRef.current = next;
    setFocus(next);
    setShowFocus(false);
    setFocusQuery('');
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }

  const focusedProducts = focusQuery.trim()
    ? PRODUCTS.filter((p) =>
        `${p.name} ${p.subtitle} ${p.category}`.toLowerCase().includes(focusQuery.trim().toLowerCase()),
      ).slice(0, 24)
    : PRODUCTS.slice(0, 24);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header: title + controls + focus/model chips + persona selector */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: t.line }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: t.text }]}>Assistant</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {voiceOn && (
              <Pressable
                onPress={() => setShowVoices(true)}
                style={[styles.ctrl, { backgroundColor: t.surface, borderColor: t.line }]}>
                <Ionicons name="person-circle-outline" size={18} color={t.gold} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.chipsRow}>
          <Pressable
            onPress={() => setShowFocus(true)}
            style={[styles.softChip, { backgroundColor: focus ? t.green : t.surface, borderColor: focus ? t.green : t.line, flex: 1 }]}>
            <Ionicons name="locate-outline" size={14} color={focus ? t.onPrimary : t.gold} />
            <Text numberOfLines={1} style={{ color: focus ? t.onPrimary : t.text, fontSize: 12, fontWeight: '600', flex: 1 }}>
              {focus ? `Focus: ${focus.name}` : 'Focus: Everything'}
            </Text>
            <Ionicons name="chevron-down" size={13} color={focus ? t.onPrimary : t.textSoft} />
          </Pressable>
          <Pressable
            onPress={() => setShowModels(true)}
            style={[styles.softChip, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Ionicons name="hardware-chip-outline" size={14} color={t.gold} />
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 12, fontWeight: '600', maxWidth: 96 }}>
              {activeModel.name}
            </Text>
            <Ionicons name="chevron-down" size={13} color={t.textSoft} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personaRow}>
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
        </ScrollView>
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
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.agentAvatar, { backgroundColor: t.surfaceAlt }]}>
                <Ionicons name={agent.icon as any} size={26} color={t.primary} />
              </View>
              <Text style={[styles.agentName, { color: t.text }]}>{agent.name}</Text>
              {focus && (
                <Text style={[styles.focusNote, { color: t.green, backgroundColor: t.surfaceAlt }]}>
                  🎯 Focused on {focus.name}
                </Text>
              )}
              <Text style={[styles.greeting, { color: t.textSoft }]}>{agent.greeting}</Text>
              {sttOk && (
                <Text style={[styles.voiceHint, { color: t.gold }]}>
                  Tap 🎙 to talk hands-free, or 🔊 to have replies read aloud.
                </Text>
              )}
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
          renderItem={({ item, index }) => {
            const isUser = item.role === 'user';
            const text = partsToText(item.parts as any[]);
            const tools = isUser ? [] : usedTools(item.parts as any[]);
            const speaking = speakingId === item.id;
            // Jarvis: surface in-app navigation for assistant replies (using the
            // user's prior message for tab/command intents).
            let actions: NavAction[] = [];
            if (!isUser && text && !busy) {
              let priorUser = '';
              for (let i = index - 1; i >= 0; i -= 1) {
                if (messages[i].role === 'user') {
                  priorUser = partsToText(messages[i].parts as any[]);
                  break;
                }
              }
              actions = detectNavActions(priorUser, text);
            }
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
                    <Text style={[styles.toolNote, { color: t.gold }]}>🔧 {tools.join(', ')}</Text>
                  )}
                  <Text style={{ color: isUser ? t.onPrimary : t.text, fontSize: 15, lineHeight: 21 }}>
                    {text || (busy ? '…' : '')}
                  </Text>

                  {actions.length > 0 && (
                    <View style={styles.navWrap}>
                      {actions.map((a) => (
                        <Pressable
                          key={a.key}
                          onPress={() => navTo(a)}
                          style={[styles.navChip, { borderColor: t.green, backgroundColor: t.surfaceAlt }]}>
                          <Ionicons name={a.icon as any} size={14} color={t.green} />
                          <Text style={{ color: t.green, fontSize: 12.5, fontWeight: '700' }}>{a.label}</Text>
                          <Ionicons name="arrow-forward" size={13} color={t.green} />
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {!isUser && !!text && (
                    <Pressable
                      onPress={() => (speaking ? stopSpeak() : speakText(item.id, text))}
                      hitSlop={8}
                      style={styles.speakBtn}>
                      <Ionicons
                        name={speaking ? 'stop-circle' : 'volume-medium-outline'}
                        size={16}
                        color={speaking ? t.primary : t.textSoft}
                      />
                      <Text style={{ color: speaking ? t.primary : t.textSoft, fontSize: 11.5, fontWeight: '600' }}>
                        {speaking ? 'Stop' : 'Listen'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />

        {busy && <Text style={[styles.typing, { color: t.textSoft }]}>{agent.name} is typing…</Text>}
        {status === 'error' && (
          <Text style={[styles.typing, { color: t.dark ? '#ff8a80' : '#B3261E' }]}>
            {error?.message ?? 'Something went wrong.'}
            {API_BASE ? '' : ' (no API origin resolved)'}
          </Text>
        )}

        {listening && (
          <View style={[styles.listenBar, { backgroundColor: t.surface, borderColor: t.primary }]}>
            <Ionicons name="mic" size={16} color={t.primary} />
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 13, flex: 1 }}>
              {partial || 'Listening…'}
            </Text>
            <Pressable onPress={stopListening} hitSlop={8}>
              <Ionicons name="close" size={18} color={t.textSoft} />
            </Pressable>
          </View>
        )}

        {/* Composer — integrated control: mode chip · reply selector, then input */}
        <View style={[styles.composerWrap, { borderTopColor: t.line, backgroundColor: t.bg, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.composerControls}>
            <Pressable
              onPress={() => setShowMode(true)}
              style={[styles.modeChip, { backgroundColor: t.surfaceAlt, borderColor: t.line }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={t.primary} />
              <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700' }}>Chat</Text>
              <Ionicons name="chevron-down" size={12} color={t.primary} />
            </Pressable>
            <View style={[styles.replySeg, { backgroundColor: t.surface, borderColor: t.line }]} accessibilityRole="radiogroup">
              <Pressable
                onPress={() => setReplyMode('text')}
                accessibilityLabel="Text only — silent answers"
                style={[styles.replyOpt, replyMode === 'text' && { backgroundColor: t.surfaceAlt }]}>
                <Ionicons name="text" size={15} color={replyMode === 'text' ? t.primary : t.textSoft} />
              </Pressable>
              <Pressable
                onPress={() => setReplyMode('voice')}
                accessibilityLabel="Voice reply — answers read aloud"
                style={[styles.replyOpt, replyMode === 'voice' && { backgroundColor: t.surfaceAlt }]}>
                <Ionicons name="volume-high" size={15} color={replyMode === 'voice' ? t.primary : t.textSoft} />
              </Pressable>
              {sttOk && (
                <Pressable
                  onPress={() => setReplyMode('call')}
                  accessibilityLabel="Call — hands-free voice conversation"
                  style={[styles.replyOpt, replyMode === 'call' && { backgroundColor: 'rgba(0,74,43,0.12)' }]}>
                  <Ionicons name="call" size={15} color={replyMode === 'call' ? t.green : t.textSoft} />
                </Pressable>
              )}
            </View>
          </View>
          <View style={styles.composerInputRow}>
            {sttOk && (
              <Pressable
                onPress={voiceMode ? toggleVoiceMode : listening ? stopListening : startListening}
                onLongPress={toggleVoiceMode}
                disabled={busy}
                style={[
                  styles.micBtn,
                  {
                    backgroundColor: voiceMode ? '#B3261E' : listening ? t.primary : t.surface,
                    borderColor: voiceMode ? '#B3261E' : listening ? t.primary : t.line,
                  },
                ]}>
                <Ionicons
                  name={voiceMode ? 'radio' : 'mic-outline'}
                  size={20}
                  color={voiceMode || listening ? t.onPrimary : t.textSoft}
                />
              </Pressable>
            )}
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={voiceMode ? 'Hands-free mode on — just talk' : `Message ${agent.name}…`}
              placeholderTextColor={t.textSoft}
              style={[styles.composerInput, { backgroundColor: t.surface, borderColor: t.line, color: t.text }]}
              multiline
              editable={!voiceMode}
              onSubmitEditing={() => send(input)}
            />
            <Pressable
              disabled={!input.trim() || busy}
              onPress={() => send(input)}
              style={[styles.sendBtn, { backgroundColor: input.trim() && !busy ? t.primary : t.line }]}>
              <Ionicons name="arrow-up" size={20} color={input.trim() && !busy ? t.onPrimary : t.textSoft} />
            </Pressable>
          </View>
          {sttOk && (
            <Text style={[styles.micHint, { color: t.textSoft }]}>
              {replyMode === 'call'
                ? 'Hands-free conversation on · tap 🔴 to stop'
                : replyMode === 'voice'
                ? 'Replies read aloud · tap 🎙 to dictate'
                : 'Tap 🎙 to dictate · long-press for hands-free conversation'}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Mode: Chat / Narrate */}
      <Modal visible={showMode} transparent animationType="slide" onRequestClose={() => setShowMode(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowMode(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.sheetHandle, { backgroundColor: t.line }]} />
            <Text style={[styles.sheetTitle, { color: t.text }]}>Mode</Text>
            <Pressable onPress={() => setShowMode(false)} style={[styles.modeRow, { borderColor: t.line }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={t.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Chat</Text>
                <Text style={{ color: t.textSoft, fontSize: 12.5 }}>Type and read answers</Text>
              </View>
            </Pressable>
            <Pressable onPress={narrateLast} style={[styles.modeRow, { borderColor: t.line }]}>
              <Ionicons name="volume-high" size={20} color={t.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Narrate</Text>
                <Text style={{ color: t.textSoft, fontSize: 12.5 }}>Read the last reply aloud</Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Model picker */}
      <Modal visible={showModels} transparent animationType="slide" onRequestClose={() => setShowModels(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowModels(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: t.line }]} />
            <Text style={[styles.sheetTitle, { color: t.text }]}>Choose a model</Text>
            <Text style={[styles.sheetSub, { color: t.textSoft }]}>
              Pick which AI powers the assistant. Takes effect when an AI Gateway key is connected; the
              free demo replies the same on every model.
            </Text>
            {MODELS.map((m) => {
              const active = m.id === modelId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => switchModel(m.id)}
                  style={[styles.modelRow, { borderColor: active ? t.primary : t.line, backgroundColor: active ? t.surfaceAlt : t.surface }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{m.name}</Text>
                    <Text style={{ color: t.textSoft, fontSize: 12.5, marginTop: 1 }}>{m.note}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color={t.primary} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Focus picker — scope the assistant to a product or collection */}
      <Modal visible={showFocus} transparent animationType="slide" onRequestClose={() => setShowFocus(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowFocus(false)}>
          <Pressable style={[styles.sheet, styles.focusSheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: t.line }]} />
            <Text style={[styles.sheetTitle, { color: t.text }]}>Focus the assistant</Text>
            <Text style={[styles.sheetSub, { color: t.textSoft }]}>
              Scope every answer to one product or a whole collection — it becomes a specialist on it.
            </Text>

            <Pressable
              onPress={() => applyFocus(null)}
              style={[styles.modelRow, { borderColor: !focus ? t.primary : t.line, backgroundColor: !focus ? t.surfaceAlt : t.surface }]}>
              <Ionicons name="apps-outline" size={18} color={t.gold} />
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', flex: 1 }}>Everything (no focus)</Text>
              {!focus && <Ionicons name="checkmark-circle" size={22} color={t.primary} />}
            </Pressable>

            <Text style={[styles.focusLabel, { color: t.textSoft }]}>Collections</Text>
            <View style={styles.collectionWrap}>
              {CATEGORIES.filter((c) => c !== 'All').map((c) => {
                const active = focus?.type === 'collection' && focus.id === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => applyFocus({ type: 'collection', id: c, name: `${c} collection` })}
                    style={[styles.collectionChip, { backgroundColor: active ? t.primary : t.surface, borderColor: active ? t.primary : t.line }]}>
                    <Text style={{ color: active ? t.onPrimary : t.text, fontSize: 13, fontWeight: '600' }}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.focusLabel, { color: t.textSoft }]}>A specific product</Text>
            <View style={[styles.search, { backgroundColor: t.surface, borderColor: t.line }]}>
              <Ionicons name="search" size={16} color={t.textSoft} />
              <TextInput
                value={focusQuery}
                onChangeText={setFocusQuery}
                placeholder="Search products…"
                placeholderTextColor={t.textSoft}
                autoCorrect={false}
                style={{ flex: 1, color: t.text, fontSize: 14, paddingVertical: 0 }}
              />
            </View>
            <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
              {focusedProducts.map((p) => {
                const active = focus?.type === 'product' && focus.id === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => applyFocus({ type: 'product', id: p.id, name: p.name })}
                    style={[styles.productRow, { borderBottomColor: t.line }]}>
                    <Text style={{ fontSize: 18 }}>{p.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{p.name}</Text>
                      <Text numberOfLines={1} style={{ color: t.textSoft, fontSize: 12 }}>{p.category} · {p.subtitle}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={t.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Voice picker — choose / preview / clone the voice that reads replies */}
      <VoicePicker
        visible={showVoices}
        onClose={() => setShowVoices(false)}
        t={t}
        insetsBottom={insets.bottom}
        selectedId={selectedVoiceId}
        onSelect={chooseVoice}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '800' },
  ctrl: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipsRow: { flexDirection: 'row', gap: 8 },
  softChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  personaRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  persona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 8 },
  agentAvatar: { width: 60, height: 60, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  agentName: { fontSize: 18, fontWeight: '800' },
  focusNote: { fontSize: 12.5, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  greeting: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  voiceHint: { fontSize: 12.5, textAlign: 'center', fontWeight: '600', maxWidth: 320 },
  suggestions: { gap: 8, marginTop: 12, alignSelf: 'stretch' },
  suggestion: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  toolNote: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  navWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  navChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  speakBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  typing: { fontSize: 12, paddingHorizontal: 18, paddingBottom: 4 },
  listenBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
  },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  composerControls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  replySeg: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  replyOpt: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  micBtn: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
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
  micHint: { fontSize: 11, textAlign: 'center', paddingHorizontal: 16, paddingTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  focusSheet: { maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  sheetTitle: { fontSize: 19, fontWeight: '800' },
  sheetSub: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  focusLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  collectionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  collectionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
});
