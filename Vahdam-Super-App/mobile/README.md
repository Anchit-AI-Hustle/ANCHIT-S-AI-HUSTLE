# Vahdam Super App 🍵

A customer-facing **Vahdam** mobile app for **iOS + Android** — built with Expo
(React Native) — combining a tea shop with an AI assistant.

| Tab | What it does |
|-----|--------------|
| **Shop** | Browse the Vahdam tea catalog by category, view product details, add to cart |
| **Assistant** | Streaming AI chat with 3 switchable agents — **Tea Concierge**, **Order Helper**, **Ritual Guide** — powered by Vercel AI Gateway + the AI SDK |
| **Cart** | Line items, quantity steppers, free-shipping bar, demo checkout |
| **Account** | Profile, orders, loyalty tier, settings |

The assistant runs in a built-in **demo mode** with no setup (canned streaming
replies), and upgrades to real Claude models the moment an AI Gateway key is added.

## Stack

- Expo SDK 56 · React Native 0.85 · React 19 · Expo Router (file-based) · New Architecture
- `ai@6` + `@ai-sdk/react` through **Vercel AI Gateway** (server-side, key never ships to device)
- Server route: `src/app/api/chat+api.ts` (Expo Router API route, requires `web.output: "server"`)

## 1. Run it (test on your phone today)

```bash
cd mobile
npm install                 # already done if you're here
npx expo start              # scan the QR with Expo Go (iOS/Android), or press i / a
```

> Expo Go works for this app today (no custom native modules). For a store-grade
> build with your own native config, use a **development build** (see §3).

The assistant works immediately in **demo mode**. To use real AI in dev:

```bash
cp .env.example .env        # add AI_GATEWAY_API_KEY, then restart `expo start`
```

## 2. Connect real AI (Vercel AI Gateway)

1. Create a Gateway key in the [Vercel dashboard](https://vercel.com/dashboard) → AI Gateway.
2. Put it in `.env` as `AI_GATEWAY_API_KEY` (server-only — never exposed to the app).
3. Optionally set the exact model slugs (`AI_MODEL_PREMIUM`, `AI_MODEL_FAST`) from
   your Gateway dashboard, e.g. `anthropic/claude-sonnet-4.6`.
4. On Vercel deployments you can skip the key and rely on the auto-injected
   `VERCEL_OIDC_TOKEN` (`vercel link` + `vercel env pull` locally).

The 3 agents have their own system prompts + tools (`recommendTea`, `brewingGuide`,
`lookupOrder`) and run a multi-step tool loop (`stopWhen: stepCountIs(5)`).

### Deploy the AI backend (needed for installed store builds)

In dev, `expo start` hosts the `/api/chat` route automatically. For installed
store builds the app needs a deployed origin:

```bash
npx expo export --platform web      # builds dist/ incl. the server route
# Host the server output (EAS Hosting `eas deploy`, or Vercel), then set:
# EXPO_PUBLIC_API_URL=https://<your-deployment>   in your build env
```

## 3. Build & upload to the stores (EAS)

You have **both** an Apple Developer and Google Play account, so we can go all the way.

```bash
npm i -g eas-cli
eas login                              # your Expo account
eas init                               # links the project, writes extra.eas.projectId

# Development build on a real device:
eas build --profile development --platform ios       # registers your iPhone UDID
eas build --profile development --platform android
npx expo start --dev-client

# Store builds:
eas build --profile production --platform all

# Submit:
eas submit --profile production --platform ios        # → TestFlight
eas submit --profile production --platform android     # → Play internal testing
```

**Credentials you'll supply (one-time):**

| For | What | Where it goes |
|-----|------|---------------|
| iOS device builds + TestFlight | Apple Developer Program membership | EAS manages certs/profiles |
| Non-interactive iOS submit | App Store Connect **API key** (`.p8`) + `ascAppId` + `appleTeamId` | `eas.json` → `submit.production.ios` |
| Android submit | Google Play **service-account JSON** | `mobile/google-play-service-account.json` (path set in `eas.json`) |

Edit the `REPLACE_WITH_...` placeholders in `eas.json` with your App Store Connect
app id + Apple team id before a non-interactive iOS submit (or just run `eas submit`
interactively and it'll prompt).

## Project layout

```
src/
  app/
    _layout.tsx              root Stack + CartProvider + polyfills
    (tabs)/_layout.tsx       Shop · Assistant · Cart · Account
    (tabs)/index.tsx         Shop (catalog + categories)
    (tabs)/assistant.tsx     AI chat + agent switcher
    (tabs)/cart.tsx          Cart + checkout
    (tabs)/account.tsx       Account
    product/[id].tsx         Product detail
    api/chat+api.ts          AI Gateway streaming route (+ demo fallback)
  components/product-card.tsx
  constants/vahdam.ts        brand palette, agents, API origin
  data/products.ts           seed catalog (swap to live Shopify later)
  lib/cart.tsx               cart state
  lib/theme.ts               light/dark brand theme
  lib/polyfills.ts           structuredClone polyfill for the AI SDK on RN
```

## Verified

- ✅ `tsc --noEmit` clean
- ✅ iOS bundle: `expo export --platform ios` (1855 modules, Hermes)
- ✅ Web + server: `expo export --platform web` — all routes + `/api/chat` server function build

## Swapping in live Vahdam products

The catalog in `src/data/products.ts` is seed data. Once the Shopify connector is
authenticated, replace `PRODUCTS` with a fetch from the Shopify Storefront API
(keep the same `Product` shape and the rest of the app works unchanged).
