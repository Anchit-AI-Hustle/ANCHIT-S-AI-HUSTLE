import Constants from 'expo-constants';

/**
 * Vahdam brand palette — warm, premium, tea-house feel.
 * Deep forest green + gold on cream.
 */
export const Brand = {
  green: '#0F4C36', // primary deep green
  greenDark: '#0A3325',
  greenSoft: '#E7F0EA',
  gold: '#C9A227', // accent
  goldSoft: '#F6EFD9',
  cream: '#FBF7EF', // app background (light)
  ink: '#1B1B17', // primary text
  inkSoft: '#6B6A60', // secondary text
  line: '#E8E1D3', // hairlines/borders
  white: '#FFFFFF',
  danger: '#B3261E',
  // dark mode
  bgDark: '#121410',
  surfaceDark: '#1C201A',
  inkDark: '#F3F0E7',
  inkSoftDark: '#A8A89C',
  lineDark: '#2C312A',
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

/** Client-safe agent personas (system prompts + tools live server-side). */
export type AgentId = 'concierge' | 'order' | 'ritual';

export interface AgentMeta {
  id: AgentId;
  name: string;
  tagline: string;
  icon: string; // Ionicons name
  greeting: string;
  suggestions: string[];
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
