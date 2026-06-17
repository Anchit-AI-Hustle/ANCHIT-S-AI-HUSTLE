import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/product-card';
import { CATEGORIES, PRODUCTS, type Category } from '@/data/products';
import { useBrandTheme } from '@/lib/theme';

export default function ShopScreen() {
  const t = useBrandTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState<Category>('All');

  const products = useMemo(
    () => (category === 'All' ? PRODUCTS : PRODUCTS.filter((p) => p.category === category)),
    [category],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Brand header */}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {CATEGORIES.map((c) => {
                const active = c === category;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? t.primary : t.surface,
                        borderColor: active ? t.primary : t.line,
                      },
                    ]}>
                    <Text style={{ color: active ? t.onPrimary : t.text, fontWeight: '600', fontSize: 13 }}>
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.sectionTitle, { color: t.text }]}>
              {category === 'All' ? 'Bestsellers' : category}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            <ProductCard product={item} />
          </View>
        )}
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
});
