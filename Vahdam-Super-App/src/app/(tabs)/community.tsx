import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CROSSWORD_HINT,
  DAILY_QUIZ,
  FEED,
  FEED_TAGS,
  findProduct,
  IDENTIFY,
  LAB_DISCLAIMER,
  LAB_ROWS,
  QUIZ_REWARD_KEYWORDS,
  QUIZ_REWARD_LABEL,
  TRIBES,
  type Tribe,
} from '@/data/community';
import { useCart } from '@/lib/cart';
import { useBrandTheme, type BrandTheme } from '@/lib/theme';

type ViewKey = 'play' | 'feed' | 'lab';

function nextQuizCountdown(): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(20, 0, 0, 0); // 8:00 PM local
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  const ms = next.getTime() - now.getTime();
  const h = Math.floor(ms / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 6e4);
  const s = Math.floor((ms % 6e4) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}h : ${pad(m)}m : ${pad(s)}s`;
}

export default function CommunityScreen() {
  const t = useBrandTheme();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<ViewKey>('play');
  const [tribe, setTribe] = useState<Tribe>(TRIBES[0]);
  const [points, setPoints] = useState(2450);

  const award = (n: number) => setPoints((p) => p + n);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: t.line }]}>
        <View style={styles.headRow}>
          <View>
            <Text style={[styles.kicker, { color: t.gold }]}>VAHDAM COMMUNITY</Text>
            <Text style={[styles.title, { color: t.text }]}>Wellness Hub</Text>
          </View>
          <View style={[styles.points, { backgroundColor: t.surfaceAlt }]}>
            <Ionicons name="leaf" size={14} color={t.green} />
            <View>
              <Text style={[styles.pointsNum, { color: t.text }]}>{points.toLocaleString()}</Text>
              <Text style={[styles.pointsLbl, { color: t.textSoft }]}>BrewPoints · Elite Leaf</Text>
            </View>
          </View>
        </View>

        {/* Tribe selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tribes}>
          {TRIBES.map((tr) => {
            const active = tr === tribe;
            return (
              <Pressable
                key={tr}
                onPress={() => setTribe(tr)}
                style={[styles.tribe, { backgroundColor: active ? t.primary : t.surface, borderColor: active ? t.primary : t.line }]}>
                <Ionicons name="people-outline" size={13} color={active ? t.onPrimary : t.textSoft} />
                <Text numberOfLines={1} style={{ color: active ? t.onPrimary : t.text, fontWeight: '600', fontSize: 12 }}>
                  {tr}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* View switch */}
        <View style={[styles.seg, { backgroundColor: t.surfaceAlt }]}>
          {([['play', 'Playground'], ['feed', 'Feed & Bible'], ['lab', 'The Lab']] as [ViewKey, string][]).map(([k, label]) => {
            const active = view === k;
            return (
              <Pressable key={k} onPress={() => setView(k)} style={[styles.segBtn, active && { backgroundColor: t.surface }]}>
                <Text style={{ color: active ? t.primary : t.textSoft, fontWeight: '700', fontSize: 12.5 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 14 }} showsVerticalScrollIndicator={false}>
        {view === 'play' && <Playground t={t} award={award} />}
        {view === 'feed' && <Feed t={t} />}
        {view === 'lab' && <Lab t={t} tribe={tribe} />}
      </ScrollView>
    </View>
  );
}

// ── Playground ───────────────────────────────────────────────────────────────
function Playground({ t, award }: { t: BrandTheme; award: (n: number) => void }) {
  const router = useRouter();
  const { add } = useCart();
  const [countdown, setCountdown] = useState(nextQuizCountdown());
  useEffect(() => {
    const id = setInterval(() => setCountdown(nextQuizCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  // Quiz state
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const q = DAILY_QUIZ[qi]!;

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    const correct = i === q.answer;
    if (correct) setScore((s) => s + 1);
    setTimeout(() => {
      if (qi + 1 < DAILY_QUIZ.length) {
        setQi(qi + 1);
        setPicked(null);
      } else {
        const finalScore = score + (correct ? 1 : 0);
        setQuizDone(true);
        if (finalScore === DAILY_QUIZ.length) {
          const prize = findProduct(...QUIZ_REWARD_KEYWORDS);
          if (prize) add(prize, 1);
          award(150);
        } else {
          award(40);
        }
      }
    }, 900);
  }
  function resetQuiz() {
    setQi(0); setPicked(null); setScore(0); setQuizDone(false);
  }

  // Identify-me state
  const [guess, setGuess] = useState('');
  const [identified, setIdentified] = useState(false);
  function submitGuess() {
    if (IDENTIFY.answers.includes(guess.trim().toLowerCase())) {
      setIdentified(true);
      const prize = findProduct(...IDENTIFY.rewardKeywords);
      if (prize) add(prize, 1);
      award(100);
    } else if (guess.trim()) {
      Alert.alert('Not quite', 'Think Ayurvedic adaptogen root — try again!');
    }
  }

  const [hint, setHint] = useState(false);

  return (
    <>
      {/* Daily Flash Quiz */}
      <Card t={t}>
        <CardHead t={t} icon="flash" title="Daily Flash Quiz" right={<Text style={{ color: t.gold, fontWeight: '700', fontSize: 12 }}>Live in {countdown}</Text>} />
        {!quizDone ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: t.textSoft, fontSize: 12 }}>Question {qi + 1} of {DAILY_QUIZ.length}</Text>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700', lineHeight: 22 }}>{q.q}</Text>
            {q.options.map((opt, i) => {
              const isPicked = picked === i;
              const isAnswer = i === q.answer;
              const bg = picked === null ? t.surfaceAlt : isAnswer ? '#1f7a4d' : isPicked ? '#7a2520' : t.surfaceAlt;
              const fg = picked !== null && (isAnswer || isPicked) ? '#fff' : t.text;
              return (
                <Pressable key={opt} onPress={() => pick(i)} style={[styles.opt, { backgroundColor: bg }]}>
                  <Text style={{ color: fg, fontWeight: '600', fontSize: 14 }}>{opt}</Text>
                  {picked !== null && isAnswer && <Ionicons name="checkmark-circle" size={18} color="#fff" />}
                </Pressable>
              );
            })}
            {picked !== null && <Text style={{ color: t.textSoft, fontSize: 12.5, fontStyle: 'italic' }}>{q.fact}</Text>}
          </View>
        ) : (
          <View style={{ gap: 8, alignItems: 'center', paddingVertical: 6 }}>
            <Ionicons name={score === DAILY_QUIZ.length ? 'trophy' : 'ribbon'} size={34} color={t.gold} />
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 18 }}>{score}/{DAILY_QUIZ.length} correct</Text>
            {score === DAILY_QUIZ.length ? (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ color: t.green, fontWeight: '700' }}>Code: WINMATCHAFREE</Text>
                <Text style={{ color: t.textSoft, fontSize: 12.5, textAlign: 'center' }}>Unlocked {QUIZ_REWARD_LABEL} (+150 pts).</Text>
              </View>
            ) : (
              <Text style={{ color: t.textSoft, fontSize: 12.5, textAlign: 'center' }}>+40 pts. Come back at 8 PM for the live round.</Text>
            )}
            <Pressable onPress={resetQuiz} style={[styles.ghostBtn, { borderColor: t.line }]}>
              <Text style={{ color: t.text, fontWeight: '600', fontSize: 13 }}>Play again</Text>
            </Pressable>
          </View>
        )}
      </Card>

      {/* Identify Me & Win Me */}
      <Card t={t}>
        <CardHead t={t} icon="eye" title="Identify Me & Win Me" />
        <Text style={{ color: t.text, fontSize: 14, lineHeight: 21 }}>{IDENTIFY.clue}</Text>
        {!identified ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TextInput
              value={guess}
              onChangeText={setGuess}
              placeholder="Your guess…"
              placeholderTextColor={t.textSoft}
              autoCapitalize="none"
              onSubmitEditing={submitGuess}
              style={[styles.input, { backgroundColor: t.surfaceAlt, color: t.text, borderColor: t.line }]}
            />
            <Pressable onPress={submitGuess} style={[styles.solidBtn, { backgroundColor: t.primary }]}>
              <Text style={{ color: t.onPrimary, fontWeight: '700', fontSize: 13 }}>Guess</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.win, { backgroundColor: t.surfaceAlt }]}>
            <Ionicons name="gift" size={20} color={t.gold} />
            <Text style={{ color: t.text, flex: 1, fontSize: 13 }}>Correct — Ashwagandha! Unlocked {IDENTIFY.rewardLabel} (+100 pts), added to your reward locker.</Text>
          </View>
        )}
      </Card>

      {/* Crossword teaser */}
      <Card t={t}>
        <CardHead t={t} icon="grid" title="Weekly Tea-Route Crossword" />
        <Text style={{ color: t.textSoft, fontSize: 13 }}>Complete this week’s crossword for loyalty points.</Text>
        {hint && <Text style={{ color: t.text, fontSize: 13, marginTop: 4 }}>Hint · {CROSSWORD_HINT}</Text>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable onPress={() => setHint(true)} style={[styles.ghostBtn, { borderColor: t.line }]}>
            <Text style={{ color: t.text, fontWeight: '600', fontSize: 13 }}>Reveal hint</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/community/crossword' as Href)} style={[styles.solidBtn, { backgroundColor: t.primary }]}>
            <Text style={{ color: t.onPrimary, fontWeight: '700', fontSize: 13 }}>Open crossword</Text>
          </Pressable>
        </View>
      </Card>
    </>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────────────
function Feed({ t }: { t: BrandTheme }) {
  const router = useRouter();
  const { add } = useCart();
  const [tag, setTag] = useState<(typeof FEED_TAGS)[number]>('All');
  const [likes, setLikes] = useState<Record<string, number>>(() =>
    Object.fromEntries(FEED.map((p) => [p.id, p.likes])),
  );
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  const posts = useMemo(() => (tag === 'All' ? FEED : FEED.filter((p) => p.tag === tag)), [tag]);

  function toggleLike(id: string) {
    setLiked((l) => ({ ...l, [id]: !l[id] }));
    setLikes((c) => ({ ...c, [id]: c[id]! + (liked[id] ? -1 : 1) }));
  }
  function addIngredients(keywords: string[]) {
    const picks = keywords.map((k) => findProduct(k)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const unique = picks.filter((p, i) => picks.findIndex((x) => x.id === p.id) === i);
    unique.forEach((p) => add(p, 1));
    Alert.alert('Added to cart', `${unique.length} item${unique.length === 1 ? '' : 's'} added to your next order.`);
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        {FEED_TAGS.map((tg) => {
          const active = tg === tag;
          return (
            <Pressable key={tg} onPress={() => setTag(tg)} style={[styles.chip, { backgroundColor: active ? t.primary : t.surface, borderColor: active ? t.primary : t.line }]}>
              <Text style={{ color: active ? t.onPrimary : t.text, fontWeight: '600', fontSize: 12.5 }}>{tg}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {posts.map((p) => (
        <Card t={t} key={p.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.avatar, { backgroundColor: t.surfaceAlt }]}>
              <Ionicons name={p.type === 'expert' ? 'medkit' : p.type === 'recipe' ? 'cafe' : 'book'} size={16} color={t.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 13.5 }}>{p.author}</Text>
              <Text style={{ color: t.gold, fontSize: 11, fontWeight: '600' }}>{p.badge} · {p.tag}</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push(`/community/${p.id}` as Href)}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginTop: 8, lineHeight: 21 }}>{p.title}</Text>
            <Text style={{ color: t.textSoft, fontSize: 13.5, marginTop: 4, lineHeight: 20 }}>{p.excerpt}</Text>
            <Text style={{ color: t.green, fontSize: 12.5, fontWeight: '600', marginTop: 6 }}>Read more →</Text>
          </Pressable>
          <View style={[styles.feedActions, { borderTopColor: t.line }]}>
            <Pressable onPress={() => toggleLike(p.id)} style={styles.act}>
              <Ionicons name={liked[p.id] ? 'heart' : 'heart-outline'} size={18} color={liked[p.id] ? '#d4536f' : t.textSoft} />
              <Text style={{ color: t.textSoft, fontSize: 12.5 }}>{likes[p.id]}</Text>
            </Pressable>
            <Pressable onPress={() => router.push(`/community/${p.id}` as Href)} style={styles.act}>
              <Ionicons name="chatbubble-outline" size={16} color={t.textSoft} />
              <Text style={{ color: t.textSoft, fontSize: 12.5 }}>Comment</Text>
            </Pressable>
            <Pressable onPress={() => addIngredients(p.ingredientKeywords)} style={[styles.act, { marginLeft: 'auto' }]}>
              <Ionicons name="bag-add-outline" size={16} color={t.green} />
              <Text style={{ color: t.green, fontSize: 12.5, fontWeight: '700' }}>Add to order</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </>
  );
}

// ── The Lab ──────────────────────────────────────────────────────────────────
function Lab({ t, tribe }: { t: BrandTheme; tribe: Tribe }) {
  return (
    <>
      <Card t={t}>
        <CardHead t={t} icon="flask" title="The Lab · Vahdam vs mass-market" />
        <Text style={{ color: t.textSoft, fontSize: 12.5, marginBottom: 4 }}>Why {tribe.replace(/ Tribe| Feed| Circle| Society| Club/, '')} buyers choose estate-direct.</Text>
        {LAB_ROWS.map((r) => (
          <View key={r.metric} style={[styles.labRow, { borderTopColor: t.line }]}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 13 }}>{r.metric}</Text>
            <View style={styles.labCols}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: t.green, fontSize: 11, fontWeight: '800' }}>VAHDAM</Text>
                <Text style={{ color: t.text, fontSize: 12.5, lineHeight: 17 }}>{r.vahdam}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: t.textSoft, fontSize: 11, fontWeight: '800' }}>MASS-MARKET{r.verify ? ' *' : ''}</Text>
                <Text style={{ color: t.textSoft, fontSize: 12.5, lineHeight: 17 }}>{r.massMarket}</Text>
              </View>
            </View>
          </View>
        ))}
      </Card>
      <Text style={{ color: t.textSoft, fontSize: 11, lineHeight: 16 }}>* {LAB_DISCLAIMER}</Text>
    </>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────
function Card({ t, children }: { t: BrandTheme; children: React.ReactNode }) {
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>{children}</View>;
}
function CardHead({ t, icon, title, right }: { t: BrandTheme; icon: string; title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.cardHead}>
      <View style={[styles.cardIcon, { backgroundColor: t.surfaceAlt }]}>
        <Ionicons name={icon as any} size={16} color={t.green} />
      </View>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: 15, flex: 1 }}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 24, fontWeight: '900', marginTop: 1 },
  points: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  pointsNum: { fontSize: 15, fontWeight: '800' },
  pointsLbl: { fontSize: 10 },
  tribes: { gap: 8, paddingVertical: 2 },
  tribe: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12 },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  solidBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 42, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 14 },
  win: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  feedActions: { flexDirection: 'row', alignItems: 'center', gap: 18, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 4 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  labRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  labCols: { flexDirection: 'row', gap: 14 },
});
