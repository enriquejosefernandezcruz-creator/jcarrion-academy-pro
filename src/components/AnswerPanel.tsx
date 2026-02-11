// src/components/AnswerPanel.tsx
import { getTextDir, type Lang } from "../rag/lang";

type Props = {
  lang: Lang;
  answer: string;
};

export function AnswerPanel({ lang, answer }: Props) {
  const dir = getTextDir(lang);

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
        // por si el contenedor limita altura en tu layout
        overflowWrap: "anywhere",
      }}
    >
      {answer}
    </div>
  );
}



