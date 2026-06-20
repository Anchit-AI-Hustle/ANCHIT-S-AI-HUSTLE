import type { Href } from 'expo-router';

import { CATEGORIES, PRODUCTS, type Category, type Product } from '@/data/products';

/**
 * "Vahdam Jarvis" — a lightweight, on-device intent layer that turns the
 * assistant's replies (and your own commands) into tappable, in-app navigation.
 * It runs in BOTH free demo mode and live-gateway mode because it reads plain
 * text rather than depending on server tool-calls — so "show me the Lakadong
 * turmeric" or "take me to my cart" always surfaces an Open button.
 */
export interface NavAction {
  key: string;
  kind: 'product' | 'category' | 'tab';
  label: string;
  icon: string; // Ionicons name
  href: Href;
}

// Words too generic to identify a product on their own.
const STOP = new Set([
  'tea', 'teas', 'chai', 'the', 'and', 'with', 'for', 'vahdam', 'blend', 'blends',
  'organic', 'loose', 'leaf', 'green', 'black', 'herbal', 'wellness', 'spiced',
  'masala', 'gift', 'set', 'pack', 'box', 'bags', 'premium', 'pure',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function matchProducts(text: string): Product[] {
  const lc = ` ${text.toLowerCase()} `;
  const scored: { p: Product; score: number }[] = [];
  for (const p of PRODUCTS) {
    const nameLc = p.name.toLowerCase();
    const toks = tokenize(p.name).filter((w) => w.length >= 4 && !STOP.has(w));
    if (toks.length === 0) continue;
    let matched = 0;
    let distinctive = 0;
    for (const w of toks) {
      if (lc.includes(w)) {
        matched += 1;
        if (w.length >= 6) distinctive += 1; // e.g. lakadong, turmeric, matcha, darjeeling
      }
    }
    const full = text.toLowerCase().includes(nameLc);
    const qualifies = full || matched >= 2 || distinctive >= 1;
    if (!qualifies) continue;
    const score = (full ? 100 : 0) + matched * 2 + distinctive;
    scored.push({ p, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.p);
}

function matchCategories(text: string): Category[] {
  const lc = text.toLowerCase();
  const out: Category[] = [];
  for (const c of CATEGORIES) {
    if (c === 'All') continue;
    if (!new RegExp(`\\b${c.toLowerCase()}\\b`).test(lc)) continue;
    // "Black"/"Green" are common words — only treat them as a collection in tea context.
    if ((c === 'Black' || c === 'Green') && !/tea|teas|leaf|blend|collection|caffeine/.test(lc)) continue;
    out.push(c);
  }
  return out;
}

const NAV_VERB = /\b(open|go|goto|show|take me|navigate|view|see|bring up|jump to|head to)\b/;

const TABS: { re: RegExp; href: Href; label: string; icon: string }[] = [
  { re: /\b(cart|bag|basket|checkout)\b/, href: '/(tabs)/cart' as Href, label: 'Open Cart', icon: 'bag-outline' },
  {
    re: /\b(community|tribe|tribes|playground|wellness feed|the lab|crossword|quiz)\b/,
    href: '/(tabs)/community' as Href,
    label: 'Open Community',
    icon: 'people-outline',
  },
  { re: /\b(account|profile|my orders|order history|settings)\b/, href: '/(tabs)/account' as Href, label: 'Open Account', icon: 'person-outline' },
  { re: /\b(shop|store|catalog|browse|homepage|home screen)\b/, href: '/(tabs)' as Href, label: 'Open Shop', icon: 'storefront-outline' },
];

function categoryHref(c: Category): Href {
  return { pathname: '/(tabs)', params: { category: c } } as Href;
}

/**
 * Build navigation actions from the assistant's reply and the user's message.
 * Products/collections come mainly from the reply (what was recommended); tab
 * jumps come from explicit user commands ("take me to my cart").
 */
export function detectNavActions(userText: string, assistantText: string): NavAction[] {
  const actions: NavAction[] = [];
  const seen = new Set<string>();
  const push = (a: NavAction) => {
    if (seen.has(a.key)) return;
    seen.add(a.key);
    actions.push(a);
  };

  const corpus = `${assistantText}\n${userText}`;

  for (const p of matchProducts(corpus)) {
    push({
      key: `product:${p.id}`,
      kind: 'product',
      label: `Open ${p.name}`,
      icon: 'leaf-outline',
      href: `/product/${p.id}` as Href,
    });
  }

  for (const c of matchCategories(corpus)) {
    push({
      key: `category:${c}`,
      kind: 'category',
      label: `Browse ${c} teas`,
      icon: 'grid-outline',
      href: categoryHref(c),
    });
  }

  // Tab jumps: only when the USER explicitly asked to navigate.
  if (NAV_VERB.test(userText.toLowerCase())) {
    for (const tab of TABS) {
      if (tab.re.test(userText.toLowerCase())) {
        push({ key: `tab:${tab.label}`, kind: 'tab', label: tab.label, icon: tab.icon, href: tab.href });
      }
    }
  }

  return actions.slice(0, 4);
}
