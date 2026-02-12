// src/components/AnswerPanel.tsx
import { getTextDir, type Lang } from "../rag/lang";

type Props = {
  lang: Lang;
  answer: string;
};

function normalize(s: string) {
  return (s ?? "").toLowerCase();
}

export function AnswerPanel({ lang, answer }: Props) {
  const dir = getTextDir(lang);

  // Preparado por si decides usarlo después (hoy no afecta)
  const hasRefsInside =
    normalize(answer).includes("referencias") ||
    normalize(answer).includes("referințe") ||
    normalize(answer).includes("referências") ||
    normalize(answer).includes("المراجع");

  void hasRefsInside;

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
      {answer}
    </div>
  );
}




