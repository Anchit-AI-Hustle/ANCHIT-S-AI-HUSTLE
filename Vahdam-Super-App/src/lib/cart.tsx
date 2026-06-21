import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getProduct, PRODUCTS, type Product } from '@/data/products';

const STORAGE_KEY = 'vahdam.cart.v1';

export interface CartLine {
  product: Product;
  qty: number;
}

interface CartValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  hydrated: boolean;
  add: (product: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  qtyOf: (productId: string) => number;
}

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  // Hydrate once from storage; seed a demo item only on a truly fresh install.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw != null) {
          const saved = JSON.parse(raw) as { id: string; qty: number }[];
          const restored = saved
            .map((s) => {
              const p = getProduct(s.id);
              return p && s.qty > 0 ? { product: p, qty: s.qty } : null;
            })
            .filter((l): l is CartLine => l !== null);
          setLines(restored);
        } else {
          const seed = PRODUCTS[0];
          setLines(seed ? [{ product: seed, qty: 1 }] : []);
        }
      } catch {
        const seed = PRODUCTS[0];
        setLines(seed ? [{ product: seed, qty: 1 }] : []);
      } finally {
        hydratedRef.current = true;
        setHydrated(true);
      }
    })();
  }, []);

  // Persist on every change — but only after hydration, so the initial empty
  // state never clobbers a saved cart.
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(lines.map((l) => ({ id: l.product.id, qty: l.qty }))),
    ).catch(() => {});
  }, [lines]);

  const add = useCallback((product: Product, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: l.qty + qty } : l,
        );
      }
      return [...prev, { product, qty }];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== productId)
        : prev.map((l) => (l.product.id === productId ? { ...l, qty } : l)),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const qtyOf = useCallback(
    (productId: string) => lines.find((l) => l.product.id === productId)?.qty ?? 0,
    [lines],
  );

  const value = useMemo<CartValue>(() => {
    const count = lines.reduce((n, l) => n + l.qty, 0);
    const subtotal = lines.reduce((sum, l) => sum + l.product.priceUsd * l.qty, 0);
    return { lines, count, subtotal, hydrated, add, setQty, remove, clear, qtyOf };
  }, [lines, hydrated, add, setQty, remove, clear, qtyOf]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
