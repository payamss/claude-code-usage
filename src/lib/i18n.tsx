'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from './storage';
import en from '@/i18n/en.json';
import fa from '@/i18n/fa.json';
import ja from '@/i18n/ja.json';
import ko from '@/i18n/ko.json';
import pt from '@/i18n/pt.json';
import fr from '@/i18n/fr.json';
import de from '@/i18n/de.json';
import es from '@/i18n/es.json';
import zhTW from '@/i18n/zh-TW.json';

export type Lang = 'en' | 'fa' | 'ja' | 'ko' | 'pt' | 'fr' | 'de' | 'es' | 'zh-TW';

type Dict = Record<string, unknown> & {
  _meta?: { name: string; dir: 'ltr' | 'rtl' };
  labels?: Record<string, string>;
  prefixes?: Record<string, string>;
  suffixes?: Record<string, string>;
};

// Add a language here and drop its JSON into src/i18n/.
export const LANGS: Record<Lang, Dict> = {
  en: en as Dict,
  fa: fa as Dict,
  ja: ja as Dict,
  ko: ko as Dict,
  pt: pt as Dict,
  fr: fr as Dict,
  de: de as Dict,
  es: es as Dict,
  'zh-TW': zhTW as Dict,
};

const LOCALES: Record<Lang, string | undefined> = {
  en: undefined,
  fa: 'fa-IR-u-nu-latn',
  ja: 'ja-JP',
  ko: 'ko-KR',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  'zh-TW': 'zh-TW',
};

export type Vars = Record<string, string | number>;

interface I18n {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (l: Lang) => void;
  /** translate a UI key, substituting {placeholders} */
  t: (key: string, vars?: Vars) => string;
  /** translate a label produced by the server (bucket / category names) */
  tl: (label: string) => string;
  /** locale for Intl formatting (Latin digits in Farsi too) */
  locale: string | undefined;
}

const Ctx = createContext<I18n | null>(null);

function translate(dict: Dict, key: string, vars?: Vars): string {
  let s = (dict[key] ?? (en as Dict)[key] ?? key) as string;
  if (typeof s !== 'string') return key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
}

function translateLabel(dict: Dict, label: string): string {
  if (!label) return '';
  const L = dict.labels || {};
  if (L[label]) return L[label];
  for (const [suf, rep] of Object.entries(dict.suffixes || {})) if (label.endsWith(suf)) return translateLabel(dict, label.slice(0, -suf.length)) + rep;
  for (const [pre, rep] of Object.entries(dict.prefixes || {})) if (label.startsWith(pre)) return rep + label.slice(pre.length);
  return label;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [saved, save] = useLocalStorage('lang', 'en');
  const lang: Lang = (saved in LANGS ? saved : 'en') as Lang;
  const dict = LANGS[lang];
  const dir = dict._meta?.dir || 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => save(l), [save]);

  const value = useMemo<I18n>(() => ({
    lang, dir, setLang,
    t: (key, vars) => translate(dict, key, vars),
    tl: (label) => translateLabel(dict, label),
    locale: LOCALES[lang],
  }), [lang, dir, dict, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useT outside I18nProvider');
  return v;
}
