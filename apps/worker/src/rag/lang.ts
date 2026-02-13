// =====================================
// FILE: worker/src/rag/lang.ts
// =====================================
export type Lang = "es" | "pt" | "ro" | "ar";

export type LangInfo = {
  lang: Lang;
  isRTL: boolean;
};

export function detectLang(question: string, forced?: Lang): Lang {
  return forced ?? detectLangCode(question);
}

export function detectLangInfo(question: string, forced?: Lang): LangInfo {
  const lang = detectLang(question, forced);
  return { lang, isRTL: lang === "ar" };
}

function detectLangCode(question: string): Lang {
  const q = (question ?? "").trim();
  if (!q) return "es";

  // AR: unicode ranges
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(q);
  if (hasArabic) return "ar";

  const lower = q.toLowerCase();

  // RO: diacritics (covers most real cases)
  if (/[ăâîșşțţ]/i.test(lower)) return "ro";

  // PT: SOLO señales fuertes (evita falsos positivos con ES)
  //  - diacríticos característicos: ã õ ç
  //  - tokens muy distintivos de PT: você/vocês, obrigado/a, não (con tilde), por favor
  //  - formas verbales muy PT: faço, fiz, estou, está (con acento), também (con acento)
  //
  // IMPORTANTE: NO usar palabras compartidas ES/PT (multa, durante, multado, etc.)
  const hasPTDiacritics = /[ãõç]/i.test(lower);
  const hasPTStrongTokens = /\b(você|vocês|obrigado|obrigada|por favor|faço|fiz|estou|também|não)\b/i.test(
    lower
  );

  if (hasPTDiacritics || hasPTStrongTokens) return "pt";

  // Default
  return "es";
}

export function isRTLLang(lang: Lang): boolean {
  return lang === "ar";
}

export function getTextDir(lang: Lang): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

export function langName(lang: Lang): string {
  switch (lang) {
    case "es":
      return "Español";
    case "pt":
      return "Português";
    case "ro":
      return "Română";
    case "ar":
      return "العربية";
    default:
      return "Español";
  }
}

export type UIStrings = {
  manual: string;
  recursos: string;
  buscar: string;
  resultado: string;
  noEncontrado: string;
  aviso: string;
  noInfo: string;
  refs: string;
};

export const uiStringsMap: Record<Lang, UIStrings> = {
  es: {
    manual: "Manual",
    recursos: "Recursos",
    buscar: "Buscar",
    resultado: "Resultado",
    noEncontrado: "No encontrado",
    aviso: "Aviso",
    noInfo: "No encuentro esa información en el manual.",
    refs: "Referencias",
  },
  pt: {
    manual: "Manual",
    recursos: "Recursos",
    buscar: "Pesquisar",
    resultado: "Resultado",
    noEncontrado: "Não encontrado",
    aviso: "Aviso",
    noInfo: "Não encontro essa informação no manual.",
    refs: "Referências",
  },
  ro: {
    manual: "Manual",
    recursos: "Resurse",
    buscar: "Caută",
    resultado: "Rezultat",
    noEncontrado: "Nu a fost găsit",
    aviso: "Avertisment",
    noInfo: "Nu găsesc această informație în manual.",
    refs: "Referințe",
  },
  ar: {
    manual: "الدليل",
    recursos: "الموارد",
    buscar: "بحث",
    resultado: "النتيجة",
    noEncontrado: "غير موجود",
    aviso: "تنبيه",
    noInfo: "لا أجد هذه المعلومة في الدليل.",
    refs: "المراجع",
  },
};

export function uiStrings(lang: Lang): UIStrings {
  return uiStringsMap[lang];
}


