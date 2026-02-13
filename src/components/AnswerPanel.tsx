// ==============================
// FILE: src/components/AnswerPanel.tsx (GOLDEN BASELINE V25 - REAL TITLES + DEDUPE)
// ==============================
import { getTextDir, type Lang } from "../rag/lang";

type Hit = {
  id?: string;
  ref?: string;
  score?: number | string;
  moduloTitulo?: string;
  seccionTitulo?: string;
  title?: string;
  metadata?: {
    title?: string;
    source?: string;
    section?: string;
    module?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

type Props = {
  lang: Lang;
  answer: string;
  hits?: Hit[];
};

function getRefsHeader(lang: Lang): string {
  if (lang === "ro") return "Referințe:";
  if (lang === "pt") return "Referências:";
  if (lang === "ar") return "المراجع:";
  return "Referencias:";
}

function normalizeLabel(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function extractTitle(hit: Hit, idx: number): string {
  const meta = hit?.metadata ?? {};
  const t =
    normalizeLabel(String(meta.title ?? "")) ||
    normalizeLabel(String(meta.source ?? "")) ||
    normalizeLabel(String(hit?.moduloTitulo ?? "")) ||
    normalizeLabel(String(hit?.title ?? "")) ||
    normalizeLabel(String(meta.module ?? "")) ||
    "";

  if (t) return t;

  const idFallback = normalizeLabel(String(hit?.id ?? hit?.ref ?? ""));
  if (idFallback) return idFallback;

  return `Referencia ${idx + 1}`;
}

function extractSection(hit: Hit): string {
  const meta = hit?.metadata ?? {};
  return (
    normalizeLabel(String(hit?.seccionTitulo ?? "")) ||
    normalizeLabel(String(meta.section ?? "")) ||
    ""
  );
}

export function AnswerPanel({ lang, answer, hits }: Props) {
  const dir = getTextDir(lang);

  const refs = (() => {
    if (!Array.isArray(hits) || hits.length === 0) return [];

    const mapped = hits.map((h, idx) => {
      const title = extractTitle(h, idx);
      const section = extractSection(h);

      let label = title;
      if (section && !label.includes(section)) label += ` — ${section}`;

      const dedupKey = normalizeLabel(label).toLowerCase();
      return { dedupKey, label };
    });

    // dedupe por label
    const seen = new Set<string>();
    const out: Array<{ label: string }> = [];
    for (const r of mapped) {
      if (!r.label) continue;
      if (seen.has(r.dedupKey)) continue;
      seen.add(r.dedupKey);
      out.push({ label: r.label });
      if (out.length >= 5) break; // UX hard limit
    }

    return out;
  })();

  return (
    <div
      dir={dir}
      className="jcarrion-hide-scrollbar"
      style={{
        direction: dir,
        textAlign: dir === "rtl" ? "right" : "left",
        unicodeBidi: "plaintext",
        whiteSpace: "pre-wrap",
        lineHeight: 1.35,
        overflowWrap: "anywhere",
      }}
    >
      <div style={{ marginBottom: refs.length > 0 ? "1.2rem" : 0 }}>{answer}</div>

      {refs.length > 0 && (
        <div
          style={{
            marginTop: "1rem",
            paddingTop: "0.8rem",
            borderTop: "1px solid #27272a",
            fontSize: "0.85rem",
            color: "#a1a1aa",
          }}
        >
          <strong style={{ color: "#fff", display: "block", marginBottom: "0.4rem" }}>
            {getRefsHeader(lang)}
          </strong>

          <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
            {refs.map((r, i) => (
              <li key={`${r.label}__${i}`} style={{ marginBottom: "0.2rem", display: "flex", gap: "8px" }}>
                <span style={{ color: "#3b82f6" }}>•</span>
                <span>{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}





