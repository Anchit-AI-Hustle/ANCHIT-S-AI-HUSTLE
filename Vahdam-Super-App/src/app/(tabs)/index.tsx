import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/product-card';
import { CATEGORIES, PRODUCTS, type Category } from '@/data/products';
import { useBrandTheme } from '@/lib/theme';

export default function ShopScreen() {
  const t = useBrandTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState<Category>('All');
  const [query, setQuery] = useState('');

  // Honor a category deep-link (e.g. the assistant's "Browse Green teas").
  useEffect(() => {
    const c = params.category;
    if (c && (CATEGORIES as readonly string[]).includes(c)) setCategory(c as Category);
  }, [params.category]);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (!q) return true;
      return `${p.name} ${p.subtitle} ${p.tags.join(' ')} ${p.category}`.toLowerCase().includes(q);
    });
  }, [category, query]);

  const heading = query.trim()
    ? `${products.length} result${products.length === 1 ? '' : 's'}`
    : `${products.length} ${category === 'All' ? 'teas' : category.toLowerCase()}`;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
              <View>
                <Text style={[styles.brand, { color: t.green }]}>VAHDAM<Text style={{ color: t.gold }}>®</Text></Text>
                <Text style={[styles.tagline, { color: t.textSoft }]}>Wellness in every cup</Text>
              </View>
              <Pressable
                onPress={() => router.push('/(tabs)/account')}
                style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
                <Ionicons name="person-outline" size={20} color={t.text} />
              </Pressable>
            </View>

            {/* Search — discover the whole catalog */}
            <View style={[styles.search, { backgroundColor: t.surface, borderColor: t.line }]}>
              <Ionicons name="search" size={18} color={t.textSoft} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`Search ${PRODUCTS.length} teas, chai & wellness…`}
                placeholderTextColor={t.textSoft}
                returnKeyType="search"
                autoCorrect={false}
                style={[styles.searchInput, { color: t.text }]}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={t.textSoft} />
                </Pressable>
              )}
            </View>

            {/* Assistant promo banner */}
            <Pressable
              onPress={() => router.push('/(tabs)/assistant')}
              style={[styles.banner, { backgroundColor: t.green }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Meet your Tea Concierge</Text>
                <Text style={styles.bannerSub}>AI-guided picks, brewing & rituals →</Text>
              </View>
              <View style={styles.bannerIcon}>
                <Ionicons name="sparkles" size={22} color={t.gold} />
              </View>
            </Pressable>

            {/* Category chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {CATEGORIES.map((c) => {
                const active = c === category;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[styles.chip, { backgroundColor: active ? t.primary : t.surface, borderColor: active ? t.primary : t.line }]}>
                    <Text style={{ color: active ? t.onPrimary : t.text, fontWeight: '600', fontSize: 13 }}>{c}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.sectionTitle, { color: t.text }]}>{heading}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            <ProductCard product={item} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="leaf-outline" size={40} color={t.textSoft} />
            <Text style={{ color: t.text, fontWeight: '700', marginTop: 8 }}>No teas match “{query.trim()}”</Text>
            <Text style={{ color: t.textSoft, fontSize: 13, marginTop: 2 }}>Try a category or a broader term.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brand: { fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  tagline: { fontSize: 12.5, marginTop: 1 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14.5, paddingVertical: 0 },
  banner: {
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerTitle: { color: 'white', fontSize: 16, fontWeight: '800' },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2 },
  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', paddingHorizontal: 16, paddingBottom: 4 },
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
});
