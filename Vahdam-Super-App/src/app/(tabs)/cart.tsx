import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatUsd } from '@/data/products';
import { useCart } from '@/lib/cart';
import { useBrandTheme } from '@/lib/theme';

const FREE_SHIP_THRESHOLD = 35;

export default function CartScreen() {
  const t = useBrandTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lines, subtotal, setQty, remove, count, clear } = useCart();

  const shipping = subtotal >= FREE_SHIP_THRESHOLD || subtotal === 0 ? 0 : 4.99;
  const total = subtotal + shipping;
  const toFree = Math.max(0, FREE_SHIP_THRESHOLD - subtotal);

  if (lines.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: t.bg, paddingTop: insets.top }]}>
        <Ionicons name="bag-outline" size={56} color={t.textSoft} />
        <Text style={[styles.emptyTitle, { color: t.text }]}>Your cart is empty</Text>
        <Text style={[styles.emptySub, { color: t.textSoft }]}>Discover teas crafted for how you want to feel.</Text>
        <Pressable onPress={() => router.push('/(tabs)')} style={[styles.cta, { backgroundColor: t.primary }]}>
          <Text style={[styles.ctaText, { color: t.onPrimary }]}>Browse teas</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={[styles.title, { color: t.text }]}>Cart</Text>
          <Text style={[styles.count, { color: t.textSoft }]}>{count} item{count === 1 ? '' : 's'}</Text>
        </View>

        {toFree > 0 ? (
          <View style={[styles.shipBar, { backgroundColor: t.surfaceAlt }]}>
            <Ionicons name="rocket-outline" size={16} color={t.green} />
            <Text style={{ color: t.text, fontSize: 12.5, flex: 1 }}>
              Add {formatUsd(toFree)} more for free shipping
            </Text>
          </View>
        ) : (
          <View style={[styles.shipBar, { backgroundColor: t.surfaceAlt }]}>
            <Ionicons name="checkmark-circle" size={16} color={t.green} />
            <Text style={{ color: t.text, fontSize: 12.5 }}>You&apos;ve unlocked free shipping 🎉</Text>
          </View>
        )}

        {lines.map((line) => (
          <View key={line.product.id} style={[styles.line, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Image source={{ uri: line.product.image }} style={[styles.thumb, { backgroundColor: line.product.accent + '22' }]} contentFit="cover" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={2} style={[styles.lineName, { color: t.text }]}>{line.product.name}</Text>
              <Text style={[styles.linePrice, { color: t.text }]}>{formatUsd(line.product.priceUsd)}</Text>
              <View style={styles.stepper}>
                <Pressable onPress={() => setQty(line.product.id, line.qty - 1)} style={[styles.stepBtn, { borderColor: t.line }]}>
                  <Ionicons name="remove" size={16} color={t.text} />
                </Pressable>
                <Text style={[styles.qty, { color: t.text }]}>{line.qty}</Text>
                <Pressable onPress={() => setQty(line.product.id, line.qty + 1)} style={[styles.stepBtn, { borderColor: t.line }]}>
                  <Ionicons name="add" size={16} color={t.text} />
                </Pressable>
                <Pressable onPress={() => remove(line.product.id)} style={{ marginLeft: 'auto' }}>
                  <Ionicons name="trash-outline" size={18} color={t.textSoft} />
                </Pressable>
              </View>
            </View>
          </View>
        ))}

        <View style={[styles.summary, { borderColor: t.line }]}>
          <Row label="Subtotal" value={formatUsd(subtotal)} t={t} />
          <Row label="Shipping" value={shipping === 0 ? 'Free' : formatUsd(shipping)} t={t} />
          <View style={[styles.divider, { backgroundColor: t.line }]} />
          <Row label="Total" value={formatUsd(total)} t={t} bold />
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: t.bg, borderTopColor: t.line, paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          onPress={() =>
            Alert.alert('Checkout', `Demo checkout for ${formatUsd(total)}.\n\nWire this to Shopify checkout to take real payments.`, [
              { text: 'OK' },
              { text: 'Clear cart', style: 'destructive', onPress: clear },
            ])
          }
          style={[styles.cta, { backgroundColor: t.primary }]}>
          <Text style={[styles.ctaText, { color: t.onPrimary }]}>Checkout · {formatUsd(total)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value, t, bold }: { label: string; value: string; t: ReturnType<typeof useBrandTheme>; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={{ color: bold ? t.text : t.textSoft, fontSize: bold ? 16 : 14, fontWeight: bold ? '800' : '500' }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: bold ? 16 : 14, fontWeight: bold ? '800' : '600' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontSize: 24, fontWeight: '800' },
  count: { fontSize: 14 },
  shipBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, padding: 10, borderRadius: 12, marginBottom: 8 },
  line: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 10, padding: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: 76, height: 76, borderRadius: 12 },
  lineName: { fontSize: 14, fontWeight: '700' },
  linePrice: { fontSize: 14, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  stepBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  qty: { fontSize: 15, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  summary: { marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', marginBottom: 8 },
});
