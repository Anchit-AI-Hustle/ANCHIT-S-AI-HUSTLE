import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatUsd, type Product } from '@/data/products';
import { useBrandTheme } from '@/lib/theme';

export function ProductCard({ product }: { product: Product }) {
  const t = useBrandTheme();
  return (
    <Link href={`/product/${product.handle}`} asChild>
      <Pressable style={StyleSheet.flatten([styles.card, { backgroundColor: t.surface, borderColor: t.line }])}>
        <View style={[styles.imageWrap, { backgroundColor: product.accent + '22' }]}>
          <Image
            source={{ uri: product.image }}
            style={styles.image}
            contentFit="cover"
            transition={250}
          />
          <View style={styles.emojiBadge}>
            <Text style={{ fontSize: 15 }}>{product.emoji}</Text>
          </View>
          {product.compareAtUsd ? (
            <View style={styles.saleTag}>
              <Text style={styles.saleText}>SALE</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={[styles.name, { color: t.text }]}>
          {product.name}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { color: t.textSoft }]}>
          {product.subtitle}
        </Text>
        <View style={styles.row}>
          <Text style={[styles.price, { color: t.text }]}>{formatUsd(product.priceUsd)}</Text>
          <View style={styles.rating}>
            <Ionicons name="star" size={12} color={t.gold} />
            <Text style={[styles.ratingText, { color: t.textSoft }]}>{product.rating}</Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 4,
  },
  imageWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    aspectRatio: 1,
    marginBottom: 6,
  },
  image: { width: '100%', height: '100%' },
  emojiBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saleTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#B3261E',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saleText: { color: 'white', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  name: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  sub: { fontSize: 11.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  price: { fontSize: 15, fontWeight: '800' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 11, fontWeight: '600' },
});
