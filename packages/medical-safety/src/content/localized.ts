import type { Language } from '@sanjeevani/types';

export type Localized = Record<Language, string>;

export function pick(text: Localized, language: Language): string {
  return text[language];
}

/** Fills {placeholders} in a localized template. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
