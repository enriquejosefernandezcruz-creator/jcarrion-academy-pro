// src/rag/lang.ts
export type Lang = "es" | "pt" | "ro" | "ar";

export type LangInfo = {
  lang: Lang;
  isRTL: boolean;
};

// =======================
// DETECCIÓN DE IDIOMA
// =======================

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

  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(q);
  if (hasArabic) return "ar";

  const lower = q.toLowerCase();

  if (/[ăâîșşțţ]/i.test(lower)) return "ro";

  if (
    /[ãõç]/i.test(lower) ||
    /\b(você|vocês|não|pra|tá|tô|está|estão|obrigado|obrigada)\b/i.test(lower)
  ) {
    return "pt";
  }

  return "es";
}

// =======================
// RTL
// =======================

export function isRTLLang(lang: Lang): boolean {
  return lang === "ar";
}

export function getTextDir(lang: Lang): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

// =======================
// NOMBRES DE IDIOMA
// =======================

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

// =======================
// STRINGS UI
// (incluye claves que tu answerFromManual ya usa: noInfo, refs)
// =======================

export type UIStrings = {
  manual: string;
  recursos: string;
  buscar: string;
  resultado: string;
  noEncontrado: string; // puede que otras pantallas lo usen
  aviso: string;

  // Claves esperadas por answerFromManual.ts (según tus errores)
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

// =======================
// RETROCOMPATIBILIDAD
// =======================

/**
 * Permite seguir usando:
 *   const S = uiStrings(lang)
 */
export function uiStrings(lang: Lang): UIStrings {
  return uiStringsMap[lang];
}




