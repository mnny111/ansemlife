import type { CSSProperties } from "react";

interface Meme {
  src: string;
  name: string;
  ticker: string;
  blurb: string;
  accent: string; // pastel accent for the friendly side
}

const MEMES: Meme[] = [
  { src: "/memes/dogwifhat.png", name: "DogWifHat", ticker: "$DOGWIFHAT", accent: "#f5a9c6", blurb: "Hat on. Conviction higher. The pup that started a thousand longs." },
  { src: "/memes/kintara.png", name: "Kintara", ticker: "$KINS", accent: "#86d98f", blurb: "Touch grass, catch fish, stay comfy — the friendliest corner of the herd." },
  { src: "/memes/cat.png", name: "Hobbes", ticker: "$HOBBES", accent: "#f0a868", blurb: "Unbothered. Moisturized. In his lane. Watching the long ride." },
];

type MemeVars = CSSProperties & { "--meme": string };

/** Friendly scrolling strip of Ansem's memes — duplicated for a seamless loop. */
export function MemeMarquee() {
  const loop = [...MEMES, ...MEMES, ...MEMES, ...MEMES];
  return (
    <div className="relative overflow-hidden border-y border-white/10 py-4">
      <div className="flex w-max animate-marquee gap-4">
        {loop.map((m, i) => (
          <figure key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] py-2 pl-2 pr-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.src} alt={m.name} className="h-12 w-12 rounded-xl object-cover" />
            <figcaption className="whitespace-nowrap">
              <div className="text-sm font-semibold">{m.name}</div>
              <div className="text-xs font-semibold" style={{ color: m.accent }}>
                {m.ticker}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** "Meet the herd" — Ansem's memes as warm, friendly cards. */
export function MemeFamily() {
  return (
    <section className="relative space-y-8">
      {/* warm pastel wash behind the friendly section */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 -bottom-10 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(40% 60% at 18% 40%, rgba(245,169,198,0.10) 0%, transparent 70%), radial-gradient(40% 60% at 50% 50%, rgba(134,217,143,0.10) 0%, transparent 70%), radial-gradient(40% 60% at 82% 60%, rgba(240,168,104,0.10) 0%, transparent 70%)",
        }}
      />
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">The herd</p>
        <h2 className="mt-2 font-display text-4xl uppercase tracking-tight sm:text-5xl">
          One big <span className="font-serif italic normal-case text-gold">friendly</span> family.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">
          Ansem&apos;s memes, all under one roof. The bull does the heavy lifting — the herd keeps it comfy.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {MEMES.map((m) => (
          <figure
            key={m.name}
            style={{ "--meme": m.accent } as MemeVars}
            className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition duration-300 hover:-translate-y-1 hover:border-[color:var(--meme)] hover:shadow-[0_18px_60px_-18px_var(--meme)]"
          >
            <div className="h-1 w-full" style={{ backgroundColor: m.accent }} />
            <div className="relative aspect-[4/3] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.src}
                alt={m.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: `linear-gradient(to top, ${m.accent}26, transparent 55%)` }}
              />
            </div>
            <figcaption className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl uppercase tracking-tight">{m.name}</h3>
                <span
                  className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: `${m.accent}26`, color: m.accent }}
                >
                  {m.ticker}
                </span>
              </div>
              <p className="mt-2 text-sm text-white/60">{m.blurb}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
