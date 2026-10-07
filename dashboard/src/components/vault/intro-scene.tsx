"use client";

import { useEffect, useRef } from "react";

/* Deterministic pseudo-random so the server and client render the same scene. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

const INK = "#030304";

/** Grass blades for one foreground clump: [path, sway delay, sway duration]. */
function grass(x0: number, x1: number, n: number, seed: number) {
  const r = seeded(seed);
  return Array.from({ length: n }, () => {
    const x = x0 + r() * (x1 - x0);
    const h = 50 + r() * 110;
    const lean = (r() - 0.35) * 46;
    const d = `M${x.toFixed(1)} 900 Q${(x + lean * 0.3).toFixed(1)} ${(900 - h * 0.55).toFixed(1)} ${(x + lean).toFixed(1)} ${(900 - h).toFixed(1)} Q${(x + lean * 0.3 + 5).toFixed(1)} ${(900 - h * 0.5).toFixed(1)} ${(x + 7).toFixed(1)} 900 Z`;
    return { d, delay: -(r() * 4), dur: 3 + r() * 2.5 };
  });
}

const GRASS = [...grass(60, 420, 34, 7), ...grass(1180, 1560, 30, 19)];

const PETALS = (() => {
  const r = seeded(42);
  return Array.from({ length: 16 }, () => ({ y: 80 + r() * 520, delay: -(r() * 16), dur: 11 + r() * 8, s: 0.6 + r() * 0.9, red: r() < 0.35 }));
})();

const BIRDS = [
  { y: 190, s: 1, dur: 38, delay: -4 },
  { y: 215, s: 0.8, dur: 41, delay: -6 },
  { y: 175, s: 0.7, dur: 44, delay: -9 },
  { y: 150, s: 0.9, dur: 52, delay: -22 },
  { y: 168, s: 0.6, dur: 55, delay: -25 },
  { y: 240, s: 0.75, dur: 47, delay: -33 },
];

/** Pagoda tiers, bottom to top: [width, y]. */
const TIERS = [0, 1, 2, 3, 4].map((i) => ({ w: 104 - i * 17, y: 452 - i * 36 }));

/**
 * The vault's intro backdrop: silhouettes of a samurai on a lakeside hill at nightfall, an
 * ember sun sinking behind the mountains. Pure SVG + CSS animation; layers drift with the pointer for parallax.
 * `leaving` pushes the camera in and dissolves the scene.
 */
export function IntroScene({ leaving }: { leaving: boolean }) {
  const root = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let raf = 0;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.05;
      cur.y += (target.y - cur.y) * 0.05;
      root.current?.style.setProperty("--mx", cur.x.toFixed(4));
      root.current?.style.setProperty("--my", cur.y.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  /** Parallax wrapper: depth 0 (sky) .. 1 (foreground). */
  const px = (depth: number) => ({ transform: `translate(calc(var(--mx, 0) * ${-depth * 28}px), calc(var(--my, 0) * ${-depth * 12}px))` });

  return (
    <svg ref={root} className={`intro-scene ${leaving ? "intro-leaving" : ""}`} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="is-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#04050a" />
          <stop offset="0.6" stopColor="#0d0a0d" />
          <stop offset="1" stopColor="#24130d" />
        </linearGradient>
        <radialGradient id="is-sun" cx="0.45" cy="0.4" r="0.65">
          <stop offset="0" stopColor="#8f2a17" />
          <stop offset="1" stopColor="#5e160c" />
        </radialGradient>
        <radialGradient id="is-sunglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c2512a" stopOpacity="0.28" />
          <stop offset="1" stopColor="#c2512a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="is-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120c0b" />
          <stop offset="1" stopColor="#040406" />
        </linearGradient>
        <linearGradient id="is-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1e14" stopOpacity="0" />
          <stop offset="1" stopColor="#3a1e14" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id="is-vignette" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id="is-haze" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6b2a16" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#3a160c" stopOpacity="0.25" />
          <stop offset="1" stopColor="#3a160c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="is-glint" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="is-soft">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      <rect width="1600" height="900" fill="url(#is-sky)" />

      {/* Clouds */}
      <g style={px(0.05)}>
        <g className="is-clouds" fill="#1a1416" opacity="0.7">
          <path d="M140 170 q40 -26 90 -10 q30 -22 80 -4 q40 4 30 22 l-210 6 q-20 -6 10 -14 z" />
          <path d="M520 110 q30 -18 70 -6 q26 -16 64 0 q30 6 20 18 l-170 4 q-14 -6 16 -16 z" />
          <path d="M1120 150 q44 -26 96 -8 q36 -24 86 -2 q40 6 28 24 l-230 6 q-20 -8 20 -20 z" />
          <path d="M1380 90 q26 -16 60 -4 q22 -14 54 0 q24 6 16 16 l-140 4 q-12 -6 10 -16 z" />
        </g>
      </g>

      {/* Sun rising over the lake */}
      <g style={px(0.08)}>
        <g className="is-sun">
          <circle cx="800" cy="545" r="290" fill="url(#is-sunglow)" />
          <circle cx="800" cy="545" r="168" fill="url(#is-sun)" />
        </g>
      </g>

      {/* Birds */}
      <g className="is-birds" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round">
        {BIRDS.map((b, i) => (
          <g key={i} className="is-bird" style={{ animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>
            <g transform={`translate(0 ${b.y}) scale(${b.s})`}>
              <path className="is-wing" d="M-12 0 Q-6 -7 0 0 Q6 -7 12 0" style={{ animationDelay: `${i * 0.13}s` }} />
            </g>
          </g>
        ))}
      </g>

      {/* Far ranges */}
      <g style={px(0.15)}>
        <g className="is-rise" style={{ animationDelay: "0.2s" }} fill="#120f12" opacity="0.95">
          <path d="M0 565 L0 360 Q60 330 100 345 Q150 290 210 250 Q250 280 290 300 Q340 240 400 230 Q460 290 520 340 Q590 420 660 480 Q720 540 780 565 Z" />
          <path d="M830 565 Q900 500 960 470 Q1020 420 1080 360 Q1130 300 1190 270 Q1240 300 1290 220 Q1340 250 1380 270 Q1440 220 1500 240 Q1560 280 1600 270 L1600 565 Z" />
        </g>
      </g>

      {/* Mid ranges + pagoda */}
      <g style={px(0.3)}>
        <g className="is-rise" style={{ animationDelay: "0.45s" }}>
          <path d="M0 565 L0 455 Q70 410 130 432 Q190 380 250 420 Q320 470 400 505 Q490 545 580 565 Z" fill="#0b090b" />
          <path d="M1010 565 Q1080 510 1150 482 Q1220 400 1290 428 Q1370 350 1450 386 Q1530 336 1600 360 L1600 565 Z" fill="#0b090b" />
          <g fill="#060507">
            {TIERS.map(({ w, y }, i) => (
              <g key={i}>
                <rect x={185 - w * 0.3} y={y - 4} width={w * 0.6} height={i === 0 ? 34 : 26} />
                <path d={`M${185 - w / 2 - 16} ${y - 2} Q${185 - w / 2 + 4} ${y - 10} ${185} ${y - 22} Q${185 + w / 2 - 4} ${y - 10} ${185 + w / 2 + 16} ${y - 2} L${185 + w / 2} ${y - 8} L${185 - w / 2} ${y - 8} Z`} />
              </g>
            ))}
            <rect x="183" y="268" width="4" height="40" />
          </g>
        </g>
      </g>

      {/* Lake */}
      <rect y="560" width="1600" height="340" fill="url(#is-water)" />
      <rect y="548" width="1600" height="26" fill="url(#is-mist)" filter="url(#is-soft)" />
      <g className="is-reflection" fill="#7a2312">
        {Array.from({ length: 10 }, (_, i) => {
          const w = 300 - i * 25;
          return <rect key={i} className="is-ripple" x={800 - w / 2} y={572 + i * 15} width={w} height={6} rx={3} opacity={0.85 - i * 0.07} style={{ animationDelay: `${-i * 0.37}s` }} />;
        })}
      </g>
      <g stroke="#5a3324" strokeWidth="2" strokeLinecap="round" opacity="0.5" className="is-lines">
        <path d="M480 676 h70 M620 640 h40 M900 700 h60 M1040 650 h50 M380 760 h90 M700 790 h70" />
      </g>
      <g fill="#020203">
        <ellipse cx="520" cy="668" rx="34" ry="8" />
        <ellipse cx="690" cy="726" rx="22" ry="6" />
        <ellipse cx="420" cy="800" rx="46" ry="10" />
        <ellipse cx="1130" cy="690" rx="26" ry="7" />
      </g>

      {/* Near cliffs + pine */}
      <g style={px(0.55)}>
        <g className="is-rise" style={{ animationDelay: "0.7s" }} fill="#030304">
          <path d="M0 900 L0 590 Q50 572 110 588 Q170 610 220 650 Q260 690 300 730 Q350 790 420 830 Q480 862 520 900 Z" />
          <path d="M1600 900 L1600 470 Q1550 466 1505 500 Q1465 540 1430 590 Q1395 645 1355 700 Q1320 760 1290 900 Z" />
          <g>
            <path d="M1508 500 Q1500 440 1470 400 Q1450 370 1420 352" stroke="#030304" strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M1478 412 Q1520 390 1556 384" stroke="#030304" strokeWidth="6" fill="none" strokeLinecap="round" />
            <ellipse cx="1418" cy="346" rx="58" ry="14" />
            <ellipse cx="1462" cy="372" rx="44" ry="11" />
            <ellipse cx="1546" cy="378" rx="48" ry="12" />
            <ellipse cx="1500" cy="326" rx="36" ry="10" />
            <ellipse cx="1390" cy="372" rx="30" ry="8" />
          </g>
        </g>
      </g>

      {/* Samurai on the hill */}
      <g style={px(0.75)}>
        <g className="is-samurai">
          {/* Ember haze behind him so the silhouette reads against the night. */}
          <ellipse className="is-haze" cx="1010" cy="690" rx="270" ry="250" fill="url(#is-haze)" />
          <path d="M560 900 Q760 828 1000 836 Q1240 846 1420 900 Z" fill="#020203" />
          <g transform="translate(1000 842)" fill={INK}>
            {/* Cloak streaming in the wind */}
            <path>
              <animate
                attributeName="d"
                dur="3.2s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0.45 0 0.55 1; 0.45 0 0.55 1; 0.45 0 0.55 1"
                values="M30 -228 Q92 -188 124 -120 Q146 -80 176 -42 Q132 -50 102 -60 Q114 -30 124 -4 Q80 -30 46 -40 Z;
                        M30 -228 Q98 -184 136 -124 Q162 -88 194 -56 Q144 -60 110 -66 Q126 -38 140 -12 Q88 -34 46 -40 Z;
                        M30 -228 Q90 -190 120 -118 Q140 -76 168 -36 Q128 -46 100 -56 Q110 -26 118 0 Q78 -28 46 -40 Z;
                        M30 -228 Q92 -188 124 -120 Q146 -80 176 -42 Q132 -50 102 -60 Q114 -30 124 -4 Q80 -30 46 -40 Z"
              />
            </path>
            {/* Robe and legs */}
            <path d="M-40 -236 Q-56 -150 -62 -62 L-52 0 L-12 0 L-6 -42 L6 -42 L12 0 L48 0 Q52 -82 48 -152 Q46 -202 42 -236 Z" />
            {/* Head and straw hat */}
            <path d="M-14 -262 L14 -262 L12 -234 L-12 -234 Z" />
            <path d="M-74 -260 L0 -302 L74 -260 Q0 -268 -74 -260 Z" />
            {/* Hat ties flicking in the wind */}
            <path stroke={INK} strokeWidth="2" fill="none">
              <animate attributeName="d" dur="1.6s" repeatCount="indefinite" values="M8 -240 Q40 -236 64 -222;M8 -240 Q42 -244 70 -236;M8 -240 Q40 -236 64 -222" />
            </path>
            {/* Katana held low, with a glint running along the blade */}
            <path d="M-22 -118 L4 -142" stroke={INK} strokeWidth="9" strokeLinecap="round" />
            <path id="is-blade" d="M-24 -116 Q-90 -64 -168 -10" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
            <circle r="5" fill="url(#is-glint)" className="is-glint">
              <animateMotion dur="5s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.25;1" calcMode="linear">
                <mpath href="#is-blade" />
              </animateMotion>
            </circle>
            {/* Sash */}
            <path stroke={INK} strokeWidth="3" fill="none">
              <animate attributeName="d" dur="2.4s" repeatCount="indefinite" values="M36 -150 Q70 -140 96 -150;M36 -150 Q72 -152 102 -138;M36 -150 Q70 -140 96 -150" />
            </path>
          </g>
        </g>
      </g>

      {/* Foreground grass */}
      <g style={px(1)} fill="#010102">
        {GRASS.map((g, i) => (
          <path key={i} d={g.d} className="is-blade" style={{ animationDelay: `${g.delay}s`, animationDuration: `${g.dur}s` }} />
        ))}
      </g>

      {/* Petals on the wind */}
      <g>
        {PETALS.map((p, i) => (
          <g key={i} className="is-petal" style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}>
            <ellipse cx="0" cy={p.y} rx={5 * p.s} ry={2.6 * p.s} fill={p.red ? "#c2512a" : "#6b4a36"} opacity="0.5" />
          </g>
        ))}
      </g>

      <rect width="1600" height="900" fill="url(#is-vignette)" />
    </svg>
  );
}
