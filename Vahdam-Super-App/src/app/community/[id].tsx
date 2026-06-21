import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CROSSWORD_ANSWER, CROSSWORD_HINT, FEED } from '@/data/community';
import { useBrandTheme } from '@/lib/theme';

interface Comment {
  id: string;
  author: string;
  text: string;
}

export default function CommunityDetail() {
  const t = useBrandTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  if (id === 'crossword') return <Crossword />;

  const post = FEED.find((p) => p.id === id);
  const [likes, setLikes] = useState(post?.likes ?? 0);
  const [liked, setLiked] = useState(false);
  const [draft, setDraft] = useState('');
  const [comments, setComments] = useState<Comment[]>([
    { id: 'c1', author: 'Priya · GCC Elite Tea Club', text: 'Tried this today — game changer for my mornings 🌿' },
  ]);

  if (!post) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <Text style={{ color: t.text }}>Post not found.</Text>
      </View>
    );
  }

  function addComment() {
    const text = draft.trim();
    if (!text) return;
    setComments((c) => [...c, { id: `c${c.length + 1}`, author: 'You', text }]);
    setDraft('');
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: '', headerTintColor: t.text, headerStyle: { backgroundColor: t.bg } }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: t.gold, fontSize: 11.5, fontWeight: '700' }}>{post.badge} · {post.tag}</Text>
        <Text style={{ color: t.text, fontSize: 24, fontWeight: '900', lineHeight: 30 }}>{post.title}</Text>
        <Text style={{ color: t.textSoft, fontSize: 13 }}>By {post.author}</Text>
        {post.body.map((para, i) => (
          <Text key={i} style={{ color: t.text, fontSize: 15.5, lineHeight: 24 }}>{para}</Text>
        ))}

        <View style={[styles.row, { borderTopColor: t.line, borderBottomColor: t.line }]}>
          <Pressable
            onPress={() => { setLiked((v) => !v); setLikes((n) => n + (liked ? -1 : 1)); }}
            style={styles.act}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#d4536f' : t.textSoft} />
            <Text style={{ color: t.textSoft, fontSize: 13 }}>{likes}</Text>
          </Pressable>
          <Text style={{ color: t.textSoft, fontSize: 13 }}>{comments.length} comments</Text>
        </View>

        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>Comments</Text>
        {comments.map((c) => (
          <View key={c.id} style={[styles.comment, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Text style={{ color: t.green, fontWeight: '700', fontSize: 12.5 }}>{c.author}</Text>
            <Text style={{ color: t.text, fontSize: 14, marginTop: 2, lineHeight: 20 }}>{c.text}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
            placeholderTextColor={t.textSoft}
            onSubmitEditing={addComment}
            style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.line }]}
          />
          <Pressable onPress={addComment} style={[styles.send, { backgroundColor: t.primary }]}>
            <Ionicons name="arrow-up" size={18} color={t.onPrimary} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Crossword() {
  const t = useBrandTheme();
  const [guess, setGuess] = useState('');
  const [solved, setSolved] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Weekly Crossword', headerTintColor: t.text, headerStyle: { backgroundColor: t.bg } }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '900' }}>Tea-Route Crossword</Text>
        <Text style={{ color: t.textSoft, fontSize: 14, lineHeight: 21 }}>1 Across · {CROSSWORD_HINT}</Text>
        {!solved ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={guess}
              onChangeText={setGuess}
              autoCapitalize="none"
              placeholder="Answer…"
              placeholderTextColor={t.textSoft}
              onSubmitEditing={() => setSolved(guess.trim().toLowerCase() === CROSSWORD_ANSWER)}
              style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.line }]}
            />
            <Pressable onPress={() => setSolved(guess.trim().toLowerCase() === CROSSWORD_ANSWER)} style={[styles.send, { backgroundColor: t.primary, width: 64 }]}>
              <Text style={{ color: t.onPrimary, fontWeight: '700' }}>Check</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.comment, { backgroundColor: t.surface, borderColor: t.line, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <Ionicons name="trophy" size={22} color={t.gold} />
            <Text style={{ color: t.text, flex: 1 }}>Solved! +75 BrewPoints added. New crossword every Monday.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, marginTop: 6 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  comment: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  input: { flex: 1, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 14 },
  send: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
