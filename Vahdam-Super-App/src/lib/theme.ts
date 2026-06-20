import { useColorScheme } from 'react-native';
import { Brand } from '@/constants/vahdam';

export interface BrandTheme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSoft: string;
  line: string;
  primary: string; // brand green (light) / gold (dark) for active + CTAs
  green: string;
  gold: string;
  onPrimary: string;
}

export function useBrandTheme(): BrandTheme {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return {
    dark,
    bg: dark ? Brand.bgDark : Brand.cream,
    surface: dark ? Brand.surfaceDark : Brand.white,
    surfaceAlt: dark ? '#23281F' : Brand.greenSoft,
    text: dark ? Brand.inkDark : Brand.ink,
    textSoft: dark ? Brand.inkSoftDark : Brand.inkSoft,
    line: dark ? Brand.lineDark : Brand.line,
    primary: dark ? Brand.gold : Brand.green,
    green: Brand.green,
    gold: Brand.gold,
    onPrimary: dark ? Brand.ink : Brand.white,
  };
}
