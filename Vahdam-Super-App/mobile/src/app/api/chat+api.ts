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

/** AI Gateway auth: a key locally, or the OIDC token auto-injected on Vercel. */
function gatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
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

type PersonaId = 'concierge' | 'order' | 'ritual';

const PERSONAS: Record<PersonaId, { model: string; system: string; tools: Record<string, any> }> = {
  concierge: {
    model: MODEL_PREMIUM,
    system:
      'You are the Vahdam Tea Concierge — warm, knowledgeable, concise. Help customers discover the perfect tea. Use the recommendTea tool when suggesting products and mention real product names and prices. Keep replies short and friendly.',
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

// ---- Mock fallback (no gateway key) ---------------------------------------

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  return last.parts
    .map((p: any) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim();
}

function mockReply(persona: PersonaId, messages: UIMessage[]): string {
  const q = lastUserText(messages).toLowerCase();
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

// ---- Route -----------------------------------------------------------------

export async function POST(req: Request) {
  const { messages, persona = 'concierge' } = (await req.json()) as {
    messages: UIMessage[];
    persona?: PersonaId;
  };
  const p = PERSONAS[persona] ?? PERSONAS.concierge;

  if (!gatewayConfigured()) {
    return streamMock(mockReply(persona, messages));
  }

  const result = streamText({
    model: p.model,
    system: p.system,
    tools: p.tools,
    stopWhen: stepCountIs(5),
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
