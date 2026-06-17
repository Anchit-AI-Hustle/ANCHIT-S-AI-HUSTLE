/**
 * Seed catalog of real Vahdam-style teas.
 *
 * Images are remote demo photos; each product also carries an `accent` color +
 * `emoji` so cards look intentional even if an image is slow/unavailable.
 * Swap `image` for live Shopify Storefront images once the Shopify connector is
 * authenticated (see lib/shopify.ts).
 */
export type Caffeine = 'high' | 'medium' | 'low' | 'none';

export interface Product {
  id: string;
  handle: string;
  name: string;
  subtitle: string;
  priceUsd: number;
  compareAtUsd?: number;
  category: 'Chai' | 'Black' | 'Green' | 'Herbal' | 'Wellness';
  caffeine: Caffeine;
  rating: number;
  reviews: number;
  description: string;
  highlights: string[];
  tags: string[];
  accent: string;
  emoji: string;
  image: string;
}

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;

export const PRODUCTS: Product[] = [
  {
    id: 'pp-masala-chai',
    handle: 'india-original-masala-chai',
    name: "India's Original Masala Chai",
    subtitle: 'Black tea · cardamom, clove, ginger',
    priceUsd: 24.99,
    compareAtUsd: 29.99,
    category: 'Chai',
    caffeine: 'high',
    rating: 4.9,
    reviews: 8123,
    description:
      'Our bestselling masala chai — full-leaf Assam black tea blended with hand-pounded cardamom, clove, cinnamon and ginger. Bold, warming and endlessly comforting.',
    highlights: ['Garden-fresh Assam', 'No artificial flavors', '100+ cups'],
    tags: ['bold', 'warming', 'morning', 'spiced'],
    accent: '#9C4A1A',
    emoji: '☕️',
    image: img('1597318181409-cf64d0b5d8a2'),
  },
  {
    id: 'pp-turmeric-chai',
    handle: 'turmeric-ginger-chai',
    name: 'Turmeric Ginger Chai',
    subtitle: 'Wellness blend · golden & soothing',
    priceUsd: 22.99,
    category: 'Wellness',
    caffeine: 'low',
    rating: 4.8,
    reviews: 4210,
    description:
      'A golden wellness chai with turmeric, ginger and warming spices over a light black tea base. Your daily anti-inflammatory ritual in a cup.',
    highlights: ['Turmeric + black pepper', 'Immunity support', 'Caffeine-light'],
    tags: ['wellness', 'immunity', 'golden', 'soothing'],
    accent: '#C9A227',
    emoji: '🌟',
    image: img('1615485290382-441e4d049cb5'),
  },
  {
    id: 'pp-himalayan-green',
    handle: 'himalayan-green-tea',
    name: 'Himalayan Green Tea',
    subtitle: 'High-grown · smooth, grassy, clean',
    priceUsd: 19.99,
    category: 'Green',
    caffeine: 'medium',
    rating: 4.7,
    reviews: 6052,
    description:
      'Hand-picked from high-altitude Himalayan gardens. A smooth, mellow green with a clean finish — no bitterness, just brightness.',
    highlights: ['Single-origin', 'Rich in antioxidants', 'Smooth, not bitter'],
    tags: ['clean', 'antioxidant', 'light', 'focus'],
    accent: '#3E7C4A',
    emoji: '🍵',
    image: img('1627435601361-ec25f5b1d0e5'),
  },
  {
    id: 'pp-earl-grey',
    handle: 'earl-grey-citrus',
    name: 'Earl Grey Citrus',
    subtitle: 'Black tea · bergamot & lemon',
    priceUsd: 21.99,
    category: 'Black',
    caffeine: 'high',
    rating: 4.8,
    reviews: 3380,
    description:
      'A refined Earl Grey — bright Italian bergamot and a whisper of lemon over a brisk black tea. Elegant any time of day.',
    highlights: ['Real bergamot oil', 'Brisk & aromatic', 'Great with milk'],
    tags: ['citrus', 'classic', 'afternoon', 'aromatic'],
    accent: '#2E4A8C',
    emoji: '🍋',
    image: img('1564890369478-c89ca6d9cde9'),
  },
  {
    id: 'pp-daily-detox',
    handle: 'daily-detox-tisane',
    name: 'Daily Detox Herbal Tisane',
    subtitle: 'Caffeine-free · lemongrass & tulsi',
    priceUsd: 18.99,
    category: 'Herbal',
    caffeine: 'none',
    rating: 4.6,
    reviews: 2740,
    description:
      'A clean, caffeine-free tisane of lemongrass, tulsi, ginger and mint to help you reset. Light, refreshing and gentle on the gut.',
    highlights: ['Caffeine-free', 'Tulsi + lemongrass', 'Reset ritual'],
    tags: ['detox', 'caffeine-free', 'refreshing', 'gut'],
    accent: '#5C8A2E',
    emoji: '🌿',
    image: img('1556881286-fc6915169721'),
  },
  {
    id: 'pp-chamomile',
    handle: 'sweet-chamomile',
    name: 'Sweet Chamomile',
    subtitle: 'Caffeine-free · calm & floral',
    priceUsd: 17.99,
    category: 'Herbal',
    caffeine: 'none',
    rating: 4.7,
    reviews: 1985,
    description:
      'Whole chamomile blossoms for a soft, honeyed, floral cup. The perfect caffeine-free wind-down before bed.',
    highlights: ['Whole blossoms', 'Naturally calming', 'Bedtime favorite'],
    tags: ['calm', 'evening', 'floral', 'sleep'],
    accent: '#D9A441',
    emoji: '🌼',
    image: img('1545048702-79362596cdc9'),
  },
  {
    id: 'pp-peppermint',
    handle: 'pure-peppermint',
    name: 'Pure Peppermint',
    subtitle: 'Caffeine-free · cool & crisp',
    priceUsd: 16.99,
    category: 'Herbal',
    caffeine: 'none',
    rating: 4.6,
    reviews: 1520,
    description:
      'Pure, bright peppermint leaves — cooling, crisp and refreshing. Great after meals or any time you need a clean lift.',
    highlights: ['Single-herb', 'After-meal favorite', 'Naturally cooling'],
    tags: ['mint', 'digestion', 'caffeine-free', 'fresh'],
    accent: '#2E8C7C',
    emoji: '🌱',
    image: img('1597481499666-1f4c5b3f0b4f'),
  },
  {
    id: 'pp-english-breakfast',
    handle: 'english-breakfast',
    name: 'English Breakfast',
    subtitle: 'Black tea · brisk & malty',
    priceUsd: 20.99,
    category: 'Black',
    caffeine: 'high',
    rating: 4.8,
    reviews: 4470,
    description:
      'A robust, malty breakfast black from Assam gardens. Strong enough to stand up to milk and sugar — your everyday wake-up cup.',
    highlights: ['Single-estate Assam', 'Bold & malty', 'Takes milk well'],
    tags: ['bold', 'morning', 'classic', 'malty'],
    accent: '#6B3A1F',
    emoji: '🌅',
    image: img('1571934811356-5cc061b6821f'),
  },
  {
    id: 'pp-ashwagandha',
    handle: 'ashwagandha-chai',
    name: 'Ashwagandha Calm Chai',
    subtitle: 'Wellness · adaptogen blend',
    priceUsd: 25.99,
    category: 'Wellness',
    caffeine: 'low',
    rating: 4.7,
    reviews: 1310,
    description:
      'An adaptogenic chai with ashwagandha, warming spices and a light tea base — crafted to help you find calm and balance.',
    highlights: ['Ashwagandha adaptogen', 'Stress-balancing', 'Cozy spice'],
    tags: ['adaptogen', 'calm', 'wellness', 'evening'],
    accent: '#7A4A8C',
    emoji: '🪷',
    image: img('1565799502656-8c52f0a1f9b9'),
  },
  {
    id: 'pp-lemon-ginger',
    handle: 'sweet-lemon-ginger',
    name: 'Sweet Lemon Ginger',
    subtitle: 'Herbal · zesty & warming',
    priceUsd: 18.99,
    category: 'Herbal',
    caffeine: 'none',
    rating: 4.6,
    reviews: 990,
    description:
      'Zingy ginger and bright lemon in a caffeine-free herbal blend. Warming, soothing for the throat, and naturally a little sweet.',
    highlights: ['Ginger + lemon', 'Throat-soothing', 'Caffeine-free'],
    tags: ['ginger', 'lemon', 'soothing', 'caffeine-free'],
    accent: '#C98A1A',
    emoji: '🍋',
    image: img('1517256064527-09c73fc73e38'),
  },
];

export const CATEGORIES = ['All', 'Chai', 'Black', 'Green', 'Herbal', 'Wellness'] as const;
export type Category = (typeof CATEGORIES)[number];

export function getProduct(idOrHandle: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === idOrHandle || p.handle === idOrHandle);
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
