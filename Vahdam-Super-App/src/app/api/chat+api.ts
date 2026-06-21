import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { PRODUCTS, formatUsd } from '@/data/products';

export const maxDuration = 30;

/**
 * Gateway model slugs. Override via env to use the exact current slug from your
 * AI Gateway dashboard (e.g. anthropic/claude-opus-4.8, anthropic/claude-sonnet-4.6).
 */
const MODEL_PREMIUM = process.env.AI_MODEL_PREMIUM ?? 'anthropic/claude-sonnet-4.5';
const MODEL_FAST = process.env.AI_MODEL_FAST ?? 'anthropic/claude-haiku-4.5';

/**
 * Models the client is allowed to request (mirrors MODELS in constants/vahdam).
 * Anything outside this set falls back to the persona's tuned default — so a
 * crafted request can't point billing at an arbitrary/expensive model.
 */
const ALLOWED_MODELS = new Set<string>([
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash',
]);

/**
 * Live AI is OPT-IN: only when an explicit AI_GATEWAY_API_KEY is set.
 * Otherwise (the default) the app runs in free demo mode with canned streaming
 * replies — no billing, no Vercel account needed. We intentionally do NOT use
 * VERCEL_OIDC_TOKEN auto-detection, so a linked Vercel project never triggers
 * AI Gateway charges. To go live later: set AI_GATEWAY_API_KEY in .env.
 */
function gatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

// ---- Tools (shared across personas) ---------------------------------------

const recommendTea = tool({
  description: 'Recommend Vahdam teas matching a mood, flavor or caffeine preference.',
  inputSchema: z.object({
    mood: z.string().describe('How the user wants to feel, e.g. calm, energized, focused').optional(),
    caffeine: z.enum(['high', 'medium', 'low', 'none']).optional(),
    flavor: z.string().optional(),
  }),
  execute: async ({ mood, caffeine, flavor }) => {
    let picks = PRODUCTS;
    if (caffeine) picks = picks.filter((p) => p.caffeine === caffeine);
    const needle = `${mood ?? ''} ${flavor ?? ''}`.toLowerCase();
    if (needle.trim()) {
      const scored = picks
        .map((p) => ({
          p,
          score: p.tags.filter((t) => needle.includes(t)).length,
        }))
        .sort((a, b) => b.score - a.score);
      if (scored.some((s) => s.score > 0)) picks = scored.filter((s) => s.score > 0).map((s) => s.p);
    }
    return picks.slice(0, 3).map((p) => ({
      name: p.name,
      handle: p.handle,
      price: formatUsd(p.priceUsd),
      caffeine: p.caffeine,
      why: p.subtitle,
    }));
  },
});

const brewingGuide = tool({
  description: 'Give brewing instructions (water temp, steep time) for a type of Vahdam tea.',
  inputSchema: z.object({
    teaType: z.enum(['Chai', 'Black', 'Green', 'Herbal', 'Wellness']),
  }),
  execute: async ({ teaType }) => {
    const guide: Record<string, { temp: string; time: string; tip: string }> = {
      Chai: { temp: 'Boil with milk', time: '4–5 min simmer', tip: 'Add a little honey at the end.' },
      Black: { temp: '95–100°C', time: '3–5 min', tip: 'Great with a splash of milk.' },
      Green: { temp: '75–80°C', time: '2–3 min', tip: "Don't use boiling water — it turns bitter." },
      Herbal: { temp: '100°C', time: '5–7 min', tip: 'Steep longer for a fuller flavor.' },
      Wellness: { temp: '90–100°C', time: '4–6 min', tip: 'Pairs well with a slice of lemon.' },
    };
    return guide[teaType];
  },
});

const lookupOrder = tool({
  description: 'Look up the status of a Vahdam order by its order number.',
  inputSchema: z.object({ orderNumber: z.string() }),
  execute: async ({ orderNumber }) => ({
    orderNumber,
    status: 'In transit',
    carrier: 'BlueDart',
    eta: '2–3 business days',
    note: 'Demo data — connect your order system to return live status.',
  }),
});

// ---- Personas --------------------------------------------------------------

type PersonaId = 'concierge' | 'vahdam' | 'order' | 'ritual';

const PERSONAS: Record<PersonaId, { model: string; system: string; tools: Record<string, any> }> = {
  concierge: {
    model: MODEL_PREMIUM,
    system:
      'You are the Vahdam Tea Concierge — warm, knowledgeable, concise. Help customers discover the perfect tea. Use the recommendTea tool when suggesting products and mention real product names and prices. Keep replies short and friendly.',
    tools: { recommendTea, brewingGuide },
  },
  vahdam: {
    model: MODEL_PREMIUM,
    system:
      "You ARE Vahdam — speak in the official Vahdam brand voice: warm, rooted, quietly proud, and human (never corporate). Vahdam is a global wellness brand built on garden-fresh, ethically sourced teas shipped direct from Indian estates within days of harvest, supporting growers through the TEAch Me foundation. Core values: freshness, purity, sustainability (plastic-neutral, carbon-neutral), and farmer empowerment. Use real product names and prices when relevant. Keep replies vivid but concise, and let pride in the leaf show without overselling.",
    tools: { recommendTea, brewingGuide },
  },
  order: {
    model: MODEL_FAST,
    system:
      'You are the Vahdam Order Helper. Help with orders, shipping and returns. Use lookupOrder when given an order number. Be clear, brief and reassuring.',
    tools: { lookupOrder },
  },
  ritual: {
    model: MODEL_PREMIUM,
    system:
      'You are the Vahdam Ritual Guide. Teach brewing and weave tea into daily wellness rituals. Use brewingGuide for steeping details. Be calm, sensory and practical.',
    tools: { brewingGuide, recommendTea },
  },
};

// ---- Focus (product/collection scoping) ------------------------------------

interface FocusInput {
  type?: 'product' | 'collection';
  id?: string;
  name?: string;
}

/** Build a system-prompt suffix that scopes the assistant to a product/collection. */
function focusSystem(focus?: FocusInput): string {
  if (!focus?.type || !focus.id) return '';
  if (focus.type === 'product') {
    const p = PRODUCTS.find((x) => x.id === focus.id || x.handle === focus.id);
    if (!p) return '';
    return ` FOCUS: The user is asking specifically about "${p.name}" (${formatUsd(p.priceUsd)}, ${p.category}, caffeine: ${p.caffeine}). ${p.subtitle}. ${p.description} Keep every answer centered on this product; recommend it confidently and explain how to enjoy it. If asked for something unrelated, gently relate it back or offer to broaden the search.`;
  }
  const cat = focus.id;
  const inCat = PRODUCTS.filter((x) => x.category === cat).slice(0, 8);
  if (inCat.length === 0) return '';
  const names = inCat.map((x) => `${x.name} (${formatUsd(x.priceUsd)})`).join('; ');
  return ` FOCUS: The user is exploring the "${cat}" collection. Stay within it. Notable picks: ${names}. Recommend from this collection and compare options within it.`;
}

// ---- Mock fallback (no gateway key) ---------------------------------------

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  return last.parts
    .map((p: any) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim();
}

function mockReply(persona: PersonaId, messages: UIMessage[], focus?: FocusInput): string {
  const q = lastUserText(messages).toLowerCase();

  // Focused on a specific product → keep the canned reply centered on it.
  if (focus?.type === 'product') {
    const p = PRODUCTS.find((x) => x.id === focus.id || x.handle === focus.id);
    if (p) {
      return `Great choice focusing on ${p.name} (${formatUsd(p.priceUsd)}) — ${p.subtitle}. ${p.description?.split('.')[0]}. ${p.highlights?.[0] ? `A standout: ${p.highlights[0]}.` : ''}\n\n(Demo mode — connect an AI Gateway key and I'll answer any detail about this product live.) 🍵`;
    }
  }
  if (focus?.type === 'collection') {
    const inCat = PRODUCTS.filter((x) => x.category === focus.id).slice(0, 3);
    if (inCat.length) {
      const list = inCat.map((x) => `${x.name} (${formatUsd(x.priceUsd)})`).join(', ');
      return `Exploring the ${focus.id} collection — three I'd start with: ${list}. Tell me your taste or mood and I'll narrow it down.\n\n(Demo mode — add an AI Gateway key for live, personalized picks within this collection.) 🌿`;
    }
  }
  if (persona === 'vahdam') {
    return "At Vahdam, freshness isn't a tagline — it's the whole point. We ship garden-fresh teas straight from Indian estates, often within days of plucking, skipping the years most tea spends in storage. Ethically sourced, plastic-neutral, and built to give growers a fairer share. That's the difference you taste in the cup. 🌿\n\n(Demo mode — connect an AI Gateway key for the full Vahdam story, in our voice.)";
  }
  if (persona === 'order') {
    return "I can help with your order! In demo mode I don't have live order data, but once an AI Gateway key is connected I'll fetch real status, tracking and returns. Typical Vahdam orders ship in 1–2 days and arrive in 2–3 business days. ✨";
  }
  if (persona === 'ritual') {
    return 'A lovely ritual: warm your cup, steep mindfully, and breathe in the aroma before the first sip. For green tea use 75–80°C for 2–3 minutes; for masala chai, simmer with milk for 4–5 minutes. (Demo mode — add an AI Gateway key for fully personalized rituals.) 🌿';
  }
  const wantsCalm = /calm|sleep|relax|evening|night|wind/.test(q);
  const wantsEnergy = /energy|morning|focus|wake|awake/.test(q);
  const caffeineFree = /caffeine-?free|no caffeine|decaf/.test(q);
  let rec = PRODUCTS[0];
  if (caffeineFree) rec = PRODUCTS.find((p) => p.caffeine === 'none') ?? rec;
  else if (wantsCalm) rec = PRODUCTS.find((p) => p.tags.includes('calm') || p.tags.includes('evening')) ?? rec;
  else if (wantsEnergy) rec = PRODUCTS.find((p) => p.caffeine === 'high') ?? rec;
  return `Based on what you said, I'd reach for ${rec?.name} (${formatUsd(rec?.priceUsd ?? 0)}) — ${rec?.subtitle}. ${rec?.description?.split('.')[0]}. \n\n(Demo mode: I'm giving a canned suggestion. Connect an AI Gateway key and I'll reason over the full catalog with live tools.) 🍵`;
}

function streamMock(text: string): Response {
  const words = text.split(/(\s+)/); // keep whitespace tokens
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const id = 'mock-1';
      writer.write({ type: 'text-start', id });
      for (const w of words) {
        writer.write({ type: 'text-delta', id, delta: w });
        await new Promise((r) => setTimeout(r, 18));
      }
      writer.write({ type: 'text-end', id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

// ---- Abuse guard ------------------------------------------------------------
// Once deployed, /api/chat is public — without this anyone could drain your AI
// Gateway credits. In-memory sliding window (per serverless instance); swap for
// Vercel KV / Upstash Redis if you run multiple instances at scale.
const RL = new Map<string, number[]>();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 20; // requests / minute / IP
const MAX_MESSAGES = 50;
const MAX_CHARS = 24_000;

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0]!.trim() || req.headers.get('x-real-ip') || 'unknown';
}
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (RL.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  hits.push(now);
  RL.set(ip, hits);
  return hits.length > RL_MAX;
}
function oversized(messages: UIMessage[]): boolean {
  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES) return true;
  return JSON.stringify(messages).length > MAX_CHARS;
}
const json = (obj: unknown, status: number) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

// ---- Route -----------------------------------------------------------------

export async function POST(req: Request) {
  if (rateLimited(clientIp(req))) return json({ error: 'rate_limited' }, 429);

  let body: { messages?: UIMessage[]; persona?: PersonaId; model?: string; focus?: FocusInput };
  try {
    body = (await req.json()) as {
      messages?: UIMessage[];
      persona?: PersonaId;
      model?: string;
      focus?: FocusInput;
    };
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const messages = body.messages ?? [];
  if (oversized(messages)) return json({ error: 'payload_too_large' }, 413);
  const persona: PersonaId = body.persona && PERSONAS[body.persona] ? body.persona : 'concierge';
  const p = PERSONAS[persona];
  // 'auto' (or anything not whitelisted) → the persona's tuned default model.
  const model = body.model && ALLOWED_MODELS.has(body.model) ? body.model : p.model;
  const system = p.system + focusSystem(body.focus);

  if (!gatewayConfigured()) {
    return streamMock(mockReply(persona, messages, body.focus));
  }

  const result = streamText({
    model,
    system,
    tools: p.tools,
    stopWhen: stepCountIs(5),
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
