import Link from "next/link";
import { HowItWorks } from "@/components/HowItWorks";
import { Disclaimer } from "@/components/Disclaimer";
import { PriceChart } from "@/components/PriceChart";
import { LiveStatsStrip } from "@/components/LiveStatsStrip";
import { Receipts } from "@/components/Receipts";

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            ★ The life of $ANSEM
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl font-display text-5xl uppercase leading-[0.92] tracking-tight sm:text-7xl">
            Enter AnsemLife.
            <br />
            Long the <span className="font-serif italic normal-case text-accent">bull</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-white/60 sm:text-lg">
            Hold $ANSEMLIFE. Every creator reward fee is automatically deployed into a 10x long on Ansem&apos;s
            coin — live, on-chain, unstoppable. The more it trades, the bigger the long.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <a
              href="https://pump.fun"
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-accent px-7 py-3 font-semibold text-black hover:bg-accent-dim"
            >
              Buy Now
            </a>
            <Link
              href="/dashboard"
              className="rounded-full border border-gold/40 px-7 py-3 font-semibold text-gold hover:border-gold hover:bg-gold/10"
            >
              View Dashboard
            </Link>
          </div>
        </div>

        {/* Hero media block → live chart */}
        <div className="relative mx-auto max-w-6xl px-6 pb-16">
          <PriceChart height={480} />
        </div>
      </section>

      {/* Live stats */}
      <div className="mx-auto max-w-6xl px-6">
        <LiveStatsStrip />
      </div>

      <div className="mx-auto max-w-6xl space-y-24 px-6 py-24">
        <HowItWorks />

        {/* CTA */}
        <section className="text-center">
          <h2 className="mx-auto max-w-3xl font-display text-4xl uppercase leading-[1.05] tracking-tight sm:text-5xl">
            Every creator reward comes home — <span className="text-accent">into the long.</span>
          </h2>
          <div className="mt-7 flex items-center justify-center gap-3">
            <a
              href="https://pump.fun"
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-accent px-7 py-3 font-semibold text-black hover:bg-accent-dim"
            >
              Buy $ANSEMLIFE
            </a>
            <Link
              href="/dashboard"
              className="rounded-full border border-gold/40 px-7 py-3 font-semibold text-gold hover:border-gold hover:bg-gold/10"
            >
              Live Dashboard
            </Link>
          </div>
        </section>

        <Receipts limit={8} sample />

        <Disclaimer />
      </div>
    </main>
  );
}
