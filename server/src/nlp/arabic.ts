// Arabic script Unicode blocks: Arabic (0600-06FF), Arabic Supplement
// (0750-077F), Arabic Extended-A (08A0-08FF), Arabic Presentation Forms A/B
// (FB50-FDFF, FE70-FEFF). Covers standard Arabic plus common Farsi/Urdu
// characters that share the block (good enough for "is this Arabic-script text").
const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function containsArabic(text: unknown): boolean {
  if (text === null || text === undefined) return false;
  return ARABIC_RANGE.test(String(text));
}

export function arabicRatio(text: string): number {
  const chars = [...text].filter((c) => /\S/.test(c));
  if (chars.length === 0) return 0;
  const arabicChars = chars.filter((c) => ARABIC_RANGE.test(c));
  return arabicChars.length / chars.length;
}
