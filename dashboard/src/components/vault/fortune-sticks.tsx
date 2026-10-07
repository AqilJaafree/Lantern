"use client";

import { sfx } from "./sfx";

/** Lacquer colors for stick heads, taken from a tea-house menu. */
export const LACQUER = {
  teal: "#0f5a4a",
  red: "#a8321c",
  gold: "#cf9419",
  orange: "#dd5a26",
  brown: "#5e3418",
  indigo: "#29467a",
  crimson: "#b2214a",
  olive: "#5f6b2a",
} as const;

/**
 * One fortune / tea-menu stick: a lacquered head with brush kanji and a key tag, then a long
 * wooden body with the English name and a one-line description. The stick rises on hover and
 * pops up and falls back on every `pulse` change (click or keyboard shortcut).
 */
export function Stick({
  kanji,
  label,
  note,
  hint,
  color,
  tilt,
  pulse = 0,
  onClick,
  busy,
  disabled,
  active,
  children,
}: {
  kanji: string;
  label: string;
  note: string;
  hint?: string;
  color: string;
  /** Fan angle in degrees (pivot is below the screen edge). */
  tilt: number;
  pulse?: number;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  active?: boolean;
  /** Replaces the body's description (e.g. an input). */
  children?: React.ReactNode;
}) {
  const body = (
    <span className={`stick-lift ${active ? "stick-active" : ""}`}>
      <span key={pulse} className={`stick-pop ${pulse ? "stick-popping" : ""}`}>
        <span className={`stick-head ${busy ? "stick-busy" : ""}`} style={{ backgroundColor: color }}>
          <span className="brush stick-kanji">{kanji}</span>
          {hint && <span className="stick-key">{hint}</span>}
        </span>
        <span className="stick-body">
          <span className="stick-label">{label}</span>
          {children ?? <span className="stick-note">{note}</span>}
        </span>
      </span>
    </span>
  );

  const style = { "--tilt": `${tilt}deg` } as React.CSSProperties;
  if (!onClick) {
    return (
      <div className="stick" style={style} onMouseEnter={() => sfx.tick()}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="stick"
      style={style}
      onClick={onClick}
      onMouseEnter={() => !disabled && sfx.tick()}
      disabled={disabled}
      aria-keyshortcuts={hint}
      aria-pressed={active}
      aria-label={`${label}: ${note}`}
    >
      {body}
    </button>
  );
}
