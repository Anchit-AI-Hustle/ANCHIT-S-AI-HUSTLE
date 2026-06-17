import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE } from '@/constants/vahdam';
import { useBrandTheme } from '@/lib/theme';

const ROWS: { icon: string; label: string; hint?: string }[] = [
  { icon: 'receipt-outline', label: 'Orders', hint: '2 active' },
  { icon: 'heart-outline', label: 'Wishlist' },
  { icon: 'location-outline', label: 'Addresses' },
  { icon: 'card-outline', label: 'Payment methods' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'help-circle-outline', label: 'Help & support' },
];

export default function AccountScreen() {
  const t = useBrandTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.title, { color: t.text }]}>Account</Text>
      </View>

      {/* Profile card */}
      <View style={[styles.profile, { backgroundColor: t.surface, borderColor: t.line }]}>
        <View style={[styles.avatar, { backgroundColor: t.surfaceAlt }]}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: t.green }}>AT</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: t.text }]}>Anchit Tandon</Text>
          <Text style={[styles.email, { color: t.textSoft }]}>anchit.tandon@gmail.com</Text>
        </View>
        <View style={[styles.tier, { backgroundColor: t.gold }]}>
          <Text style={styles.tierText}>GOLD</Text>
        </View>
      </View>

      {/* Assistant card */}
      <Pressable onPress={() => router.push('/(tabs)/assistant')} style={[styles.assistant, { backgroundColor: t.green }]}>
        <Ionicons name="sparkles" size={22} color={t.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.assistantTitle}>Need a hand?</Text>
          <Text style={styles.assistantSub}>Chat with your Vahdam assistant →</Text>
        </View>
      </Pressable>

      {/* Rows */}
      <View style={[styles.group, { backgroundColor: t.surface, borderColor: t.line }]}>
        {ROWS.map((r, i) => (
          <Pressable
            key={r.label}
            onPress={() => Alert.alert(r.label, 'Demo screen — wire to your backend.')}
            style={[styles.row, i < ROWS.length - 1 && { borderBottomColor: t.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Ionicons name={r.icon as any} size={20} color={t.text} />
            <Text style={[styles.rowLabel, { color: t.text }]}>{r.label}</Text>
            {r.hint ? <Text style={[styles.rowHint, { color: t.textSoft }]}>{r.hint}</Text> : null}
            <Ionicons name="chevron-forward" size={18} color={t.textSoft} />
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => Alert.alert('Sign out', 'Demo only.')}
        style={[styles.signout, { borderColor: t.line }]}>
        <Text style={{ color: t.dark ? '#ff8a80' : '#B3261E', fontWeight: '700' }}>Sign out</Text>
      </Pressable>

      <Text style={[styles.version, { color: t.textSoft }]}>
        Vahdam Super App · v1.0.0{'\n'}AI backend: {API_BASE ? 'connected' : 'demo mode (no gateway key)'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 52, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800' },
  email: { fontSize: 13, marginTop: 1 },
  tier: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  tierText: { color: '#1B1B17', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  assistant: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 18 },
  assistantTitle: { color: 'white', fontSize: 15, fontWeight: '800' },
  assistantSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 1 },
  group: { marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 15 },
  rowLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
  rowHint: { fontSize: 13 },
  signout: { marginHorizontal: 16, marginTop: 16, paddingVertical: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  version: { textAlign: 'center', fontSize: 11.5, marginTop: 18, lineHeight: 17 },
});
