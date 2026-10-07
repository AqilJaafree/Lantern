"use client";

import { useId } from "react";

/**
 * A dark hanging scroll (kakejiku): charcoal washi in a brocade mount between two wooden rods,
 * hung from a nail by the same rope as the wooden signs. A gold ink-wash kanji sits behind the
 * content, ink mountains along the bottom, a red seal beside the title, and an optional
 * vertical verse on a vermilion rule. Pass `shown` to unroll it; it then sways on its cord.
 */
export function InkPoster({
  kanji,
  seal,
  title,
  verse,
  shown,
  delay = 0,
  className = "",
  label,
  children,
}: {
  kanji: string;
  seal: string;
  title: string;
  verse?: string;
  shown: boolean;
  delay?: number;
  className?: string;
  label: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const style = { "--poster-delay": `${delay}s` } as React.CSSProperties;
  return (
    <section className={`ink-poster ${shown ? "poster-in" : "poster-wait"} ${className}`} style={style} aria-label={label}>
      <svg className="block w-full" height="30" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
        {[16, 84].map((x) => (
          <g key={x}>
            <line x1="50" y1="5" x2={x} y2="30" className="rope" vectorEffect="non-scaling-stroke" />
            <line x1="50" y1="5" x2={x} y2="30" className="rope-twist" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
      <span className="nail" aria-hidden />
      <span className="scroll-rod" aria-hidden />
      <div className="poster-paper">
        {/* Paper fibres. */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", mixBlendMode: "screen" }} aria-hidden>
          <filter id={`${id}f`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={4} />
            <feColorMatrix values="0 0 0 0 0.85  0 0 0 0 0.75  0 0 0 0 0.6  0 0 0 0.07 0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${id}f)`} />
        </svg>
        <span className="poster-kanji brush" aria-hidden>
          {kanji}
        </span>
        {/* Ink-wash mountains. */}
        <svg className="poster-mountains" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d6aa64" stopOpacity="0.22" />
              <stop offset="1" stopColor="#d6aa64" stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}b`}>
              <feGaussianBlur stdDeviation="0.8" />
            </filter>
          </defs>
          <path d="M0 44 L22 30 L34 36 L58 18 L80 34 L96 28 L120 42 L150 26 L170 34 L196 20 L222 36 L246 28 L270 38 L300 30 L300 60 L0 60 Z" fill={`url(#${id}m)`} opacity="0.55" filter={`url(#${id}b)`} />
          <path d="M0 52 L30 40 L52 48 L84 34 L110 50 L140 42 L178 52 L210 38 L240 50 L268 44 L300 52 L300 60 L0 60 Z" fill={`url(#${id}m)`} filter={`url(#${id}b)`} />
        </svg>
        {verse && (
          <p className="poster-verse brush" aria-hidden>
            {verse}
          </p>
        )}
        <div className="relative">
          <div className="poster-head">
            <span className="poster-seal brush" aria-hidden>
              {seal}
            </span>
            <div>
              <p className="poster-title">{title}</p>
              <span className="poster-rule" aria-hidden />
            </div>
          </div>
          {children}
        </div>
      </div>
      {/* Bottom rod: rolls down as the scroll unrolls. */}
      <div className="scroll-roller" aria-hidden>
        <span className="scroll-rod scroll-rod-bottom" />
      </div>
    </section>
  );
}
