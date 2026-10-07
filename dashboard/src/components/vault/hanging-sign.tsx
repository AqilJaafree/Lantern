"use client";

import { useEffect, useId, useState } from "react";
import { sfx } from "./sfx";

/**
 * A wooden shop sign (like a 準備中 / 営業中 board) hung from a nail by a rope. It drops in,
 * catches on the rope, swings to rest, idles with a slight sway, and lifts away when closed.
 * `className` positions the sign; the inner element owns the animation transform.
 */
export function HangingSign({
  open,
  rope = 56,
  className = "",
  children,
  onClosed,
  onClick,
  role,
  label,
}: {
  open: boolean;
  /** Rope length in px from the nail to the top of the board. */
  rope?: number;
  className?: string;
  children: React.ReactNode;
  onClosed?: () => void;
  onClick?: () => void;
  role?: "status" | "alert" | "dialog";
  label?: string;
}) {
  const [gone, setGone] = useState(!open);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setGone(false);
  }

  // The board "lands" when the rope catches (~38% into the drop).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => sfx.knock(), 600);
    return () => clearTimeout(t);
  }, [open]);

  if (gone) return null;

  return (
    <div className={className}>
      <div
        role={role}
        aria-label={label}
        onClick={onClick}
        className={`hanger ${open ? "hanger-in" : "hanger-out"}`}
        onAnimationEnd={(e) => {
          if (!open && e.animationName === "sign-lift") {
            setGone(true);
            onClosed?.();
          }
        }}
      >
        <svg className="relative z-10 -mb-3 block w-full" height={rope + 12} viewBox={`0 0 100 ${rope + 12}`} preserveAspectRatio="none" aria-hidden>
          {[22, 78].map((x) => (
            <g key={x}>
              <line x1="50" y1="6" x2={x} y2={rope + 10} className="rope" vectorEffect="non-scaling-stroke" />
              <line x1="50" y1="6" x2={x} y2={rope + 10} className="rope-twist" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
        <span className="nail" aria-hidden />
        <WoodBoard holes>{children}</WoodBoard>
      </div>
    </div>
  );
}

/** The wooden board itself: grained planks, a double ink frame with square corners. */
export function WoodBoard({ children, holes = false, className = "" }: { children: React.ReactNode; holes?: boolean; className?: string }) {
  const grain = useId();
  return (
    <div className={`wood-sign ${className}`}>
      {/* Wood grain: stretched fractal noise, as an inline SVG. */}
      <svg className="wood-grain" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
        <filter id={grain}>
          <feTurbulence type="fractalNoise" baseFrequency="0.34 0.011" numOctaves={3} seed={11} />
          <feColorMatrix values="0 0 0 0 0.40  0 0 0 0 0.24  0 0 0 0 0.10  0 0 0 0.6 -0.12" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${grain})`} />
      </svg>
      <div className="wood-frame" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      {holes && (
        <>
          <span className="wood-hole" style={{ left: "22%" }} aria-hidden />
          <span className="wood-hole" style={{ left: "78%" }} aria-hidden />
        </>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
