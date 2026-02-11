// src/components/QuestionInput.tsx
import { useEffect, useMemo, useRef } from "react";
import { detectLangInfo, getTextDir, type Lang } from "../rag/lang";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  forcedLang?: Lang;
  placeholder?: string;
  disabled?: boolean;
};

// Ajustes de comportamiento visual
const MIN_HEIGHT = 48;      // altura base (alineada con botón)
const MAX_HEIGHT = 140;     // tope antes de usar scroll interno (ajústalo a gusto)

function autoResize(el: HTMLTextAreaElement) {
  // reset para recalcular correctamente
  el.style.height = "0px";
  const next = Math.min(el.scrollHeight, MAX_HEIGHT);
  el.style.height = `${Math.max(next, MIN_HEIGHT)}px`;

  // Si supera el máximo, permitimos scroll interno pero ocultamos scrollbar por CSS
  el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
}

/**
 * Textarea preparado para RTL/LTR:
 * - dir dinámico (según idioma detectado del texto actual)
 * - auto-grow + scroll sin scrollbars visibles
 * - unicodeBidi: plaintext para mezclas árabe + números/siglas
 */
export function QuestionInput({
  value,
  onChange,
  onSubmit,
  forcedLang,
  placeholder,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const { lang, isRTL } = useMemo(
    () => detectLangInfo(value, forcedLang),
    [value, forcedLang]
  );

  const dir = getTextDir(lang);

  // Set dir + auto-resize al cambiar idioma/valor
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute("dir", dir);
    autoResize(el);
  }, [dir, value]);

  const style: React.CSSProperties = {
    width: "100%",
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    resize: "none",
    padding: "12px 14px",
    borderRadius: 8,
    background: "#0a0a0c",
    border: "1px solid #27272a",
    color: "white",
    outline: "none",
    direction: dir,
    textAlign: isRTL ? "right" : "left",
    unicodeBidi: "plaintext",
    lineHeight: "24px",
    boxSizing: "border-box",

    // Importante: ocultar scrollbar visualmente (cross-browser)
    overflowY: "hidden",         // se cambia dinámicamente en autoResize()
    scrollbarWidth: "none",      // Firefox
    msOverflowStyle: "none",     // IE/Edge legacy
  };

  return (
    <textarea
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "Escribe tu pregunta…"}
      disabled={disabled}
      style={style}
      // WebKit (Chrome/Safari): ocultar scrollbar
      className="jcarrion-hide-scrollbar"
      onKeyDown={(e) => {
        if (!onSubmit) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
    />
  );
}


