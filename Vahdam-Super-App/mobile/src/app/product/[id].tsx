import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatUsd, getProduct } from '@/data/products';
import { useCart } from '@/lib/cart';
import { useBrandTheme } from '@/lib/theme';

export default function ProductScreen() {
  const t = useBrandTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const product = getProduct(id);
  const { add, qtyOf } = useCart();
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <View style={[styles.missing, { backgroundColor: t.bg }]}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <Text style={{ color: t.text }}>Product not found.</Text>
      </View>
    );
  }

  const inCart = qtyOf(product.id);

  function onAdd() {
    add(product!, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: '', headerTransparent: true, headerTintColor: t.text }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: product.accent + '22' }]}>
          <Image source={{ uri: product.image }} style={styles.heroImg} contentFit="cover" transition={250} />
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.category, { color: t.green }]}>{product.category.toUpperCase()}</Text>
              <Text style={[styles.name, { color: t.text }]}>{product.name}</Text>
              <Text style={[styles.sub, { color: t.textSoft }]}>{product.subtitle}</Text>
            </View>
            <View style={[styles.caffeine, { backgroundColor: t.surfaceAlt }]}>
              <Ionicons name="flash-outline" size={14} color={t.green} />
              <Text style={{ color: t.green, fontSize: 11, fontWeight: '700' }}>{product.caffeine}</Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: t.text }]}>{formatUsd(product.priceUsd)}</Text>
            {product.compareAtUsd ? (
              <Text style={[styles.compare, { color: t.textSoft }]}>{formatUsd(product.compareAtUsd)}</Text>
            ) : null}
            <View style={styles.rating}>
              <Ionicons name="star" size={14} color={t.gold} />
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 13 }}>{product.rating}</Text>
              <Text style={{ color: t.textSoft, fontSize: 13 }}>({product.reviews.toLocaleString()})</Text>
            </View>
          </View>

          <View style={styles.highlights}>
            {product.highlights.map((h) => (
              <View key={h} style={[styles.highlight, { backgroundColor: t.surface, borderColor: t.line }]}>
                <Ionicons name="checkmark-circle" size={14} color={t.green} />
                <Text style={{ color: t.text, fontSize: 12.5 }}>{h}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.descTitle, { color: t.text }]}>About this tea</Text>
          <Text style={[styles.desc, { color: t.textSoft }]}>{product.description}</Text>

          <Pressable
            onPress={() => router.push('/(tabs)/assistant')}
            style={[styles.askRow, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Ionicons name="sparkles" size={18} color={t.gold} />
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
              Ask the Tea Concierge about this
            </Text>
            <Ionicons name="chevron-forward" size={18} color={t.textSoft} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Sticky add-to-cart */}
      <View style={[styles.bar, { backgroundColor: t.bg, borderTopColor: t.line, paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={onAdd} style={[styles.addBtn, { backgroundColor: added ? t.green : t.primary }]}>
          <Ionicons name={added ? 'checkmark' : 'bag-add-outline'} size={20} color={added ? 'white' : t.onPrimary} />
          <Text style={[styles.addText, { color: added ? 'white' : t.onPrimary }]}>
            {added ? 'Added to cart' : inCart > 0 ? `Add another · in cart (${inCart})` : `Add to cart · ${formatUsd(product.priceUsd)}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', aspectRatio: 1 },
  heroImg: { width: '100%', height: '100%' },
  body: { padding: 16, gap: 14 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  category: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  name: { fontSize: 24, fontWeight: '900', marginTop: 2, lineHeight: 28 },
  sub: { fontSize: 14, marginTop: 3 },
  caffeine: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  price: { fontSize: 22, fontWeight: '900' },
  compare: { fontSize: 16, textDecorationLine: 'line-through' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  highlights: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  descTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  desc: { fontSize: 14.5, lineHeight: 22 },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  addText: { fontSize: 16, fontWeight: '800' },
});
