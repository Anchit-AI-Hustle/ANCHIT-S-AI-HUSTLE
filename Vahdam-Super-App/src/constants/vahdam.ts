import Constants from 'expo-constants';

/**
 * Vahdam official design system — from the brand style guide ("only 4 official
 * colours, 2 fonts"). Headlines: serif (Lao MN / Georgia fallback). Body/UI:
 * Proxima Nova (Helvetica/Arial fallback). The 4 core tokens are exact; the
 * soft tints / dark-mode values are derived to harmonise.
 */
export const Brand = {
  green: '#004A2B', // primary — forest green (official)
  greenDark: '#003620',
  greenSoft: '#E6EFEA',
  gold: '#AB8743', // accent (official)
  goldSoft: '#F3ECDD',
  cream: '#FBF5EA', // background (official)
  ink: '#171717', // text (official)
  inkSoft: '#6A5E4E', // warm muted (brand muted text)
  line: '#ECE3D2', // hairlines/borders (brand)
  white: '#FFFFFF',
  danger: '#B3261E',
  // dark mode — derived from the brand's dark forest sections (#0f2a1c family)
  bgDark: '#0C140F',
  surfaceDark: '#11241A',
  inkDark: '#F5EAD8',
  inkSoftDark: '#A89C86',
  lineDark: '#21342A',
} as const;

/** Brand font stacks (official: Lao MN headings, Proxima Nova body). */
export const Fonts = {
  heading: 'Georgia', // Lao MN is iOS-only; Georgia is the serif fallback
  body: 'System', // Proxima Nova fallback → platform system sans
} as const;

/** Resolve the API origin for the AI route in dev (LAN host) and prod. */
function resolveApiBase(): string {
  const prod = process.env.EXPO_PUBLIC_API_URL;
  if (prod) return prod.replace(/\/$/, '');
  // In dev, Expo exposes the bundler host (e.g. "192.168.1.5:8081").
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  if (hostUri) return `http://${hostUri.split('/')[0]}`;
  return '';
}

export const API_BASE = resolveApiBase();
export const CHAT_ENDPOINT = `${API_BASE}/api/chat`;

/**
 * User-selectable models. 'auto' lets each persona pick its tuned default
 * server-side; the rest force a specific AI Gateway model. In free demo mode
 * (no gateway key) the choice is cosmetic — replies stay canned — but the
 * picker is wired end-to-end so it takes effect the moment a key is added.
 */
export type ModelId =
  | 'auto'
  | 'anthropic/claude-sonnet-4.5'
  | 'anthropic/claude-haiku-4.5'
  | 'openai/gpt-4o-mini'
  | 'google/gemini-2.0-flash';

export interface ModelMeta {
  id: ModelId;
  name: string;
  note: string;
}

export const MODELS: ModelMeta[] = [
  { id: 'auto', name: 'Auto', note: 'Best model per task (recommended)' },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', note: 'Most capable' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', note: 'Fastest replies' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', note: 'OpenAI' },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', note: 'Google' },
];

/** Client-safe agent personas (system prompts + tools live server-side). */
export type AgentId = 'concierge' | 'vahdam' | 'order' | 'ritual';

export interface AgentMeta {
  id: AgentId;
  name: string;
  tagline: string;
  icon: string; // Ionicons name
  greeting: string;
  suggestions: string[];
}

/**
 * "Focus" lets the user scope the assistant to a single product or a whole
 * collection — turning any persona into a product/collection specialist. The
 * focus is sent with each request and injected into the system prompt server-side.
 */
export interface FocusTarget {
  type: 'product' | 'collection';
  id: string; // product id, or category name for a collection
  name: string;
}

export const AGENTS: AgentMeta[] = [
  {
    id: 'concierge',
    name: 'Tea Concierge',
    tagline: 'Find your perfect brew',
    icon: 'leaf',
    greeting:
      "Namaste 🌿 I'm your Vahdam Tea Concierge. Tell me how you like to feel — calm, energized, focused — and I'll find your blend.",
    suggestions: [
      'I want something calming for the evening',
      'Best tea for morning energy?',
      'Recommend a caffeine-free option',
    ],
  },
  {
    id: 'vahdam',
    name: 'Vahdam Voice',
    tagline: 'Our brand, in its own words',
    icon: 'sparkles-outline',
    greeting:
      "Welcome to Vahdam 🌿 Garden-fresh, ethically sourced, and shipped from the source. Ask me anything — I'll answer in our voice: warm, rooted, and proud of every leaf.",
    suggestions: [
      'What makes Vahdam different?',
      'Tell me the Vahdam story',
      'Why is freshness your obsession?',
    ],
  },
  {
    id: 'order',
    name: 'Order Helper',
    tagline: 'Orders, shipping & returns',
    icon: 'cube',
    greeting:
      "Hi! I can help with orders, shipping timelines, and returns. What do you need a hand with?",
    suggestions: ['Where is my order?', 'What is your return policy?', 'Do you ship internationally?'],
  },
  {
    id: 'ritual',
    name: 'Ritual Guide',
    tagline: 'Brewing & wellness rituals',
    icon: 'sparkles',
    greeting:
      "Let's build your perfect ritual ✨ Ask me how to brew any Vahdam tea, or how to weave it into your day.",
    suggestions: ['How do I brew masala chai?', 'Best time to drink green tea?', 'Make me an evening wind-down ritual'],
  },
];
