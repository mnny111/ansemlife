function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-5">{children}</div>;
}

function StepLabel({ n, kicker }: { n: string; kicker: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-widest text-white/40">Step {n}</span>
      <span className="rounded bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">{kicker}</span>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm">
      <span className="text-white/50">{left}</span>
      <span className="font-mono">{right}</span>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="space-y-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">How it works</p>
        <h2 className="mt-2 font-display text-4xl font-black tracking-tight sm:text-5xl">
          Three steps into the long.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">
          Every creator reward fee is swept on-chain and deployed into a 10x long on Ansem&apos;s coin — automatically.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card>
          <StepLabel n="01" kicker="Buy" />
          <h3 className="mb-3 font-display text-2xl font-bold">Buy $ANSEMLIFE.</h3>
          <div className="space-y-2">
            <Row left="You pay" right="2.50 SOL" />
            <Row left="You receive" right="≈ 410,000 $ANSEMLIFE" />
            <div className="rounded-lg bg-accent px-3 py-2 text-center text-sm font-semibold text-black">
              Buy on Pump.fun
            </div>
          </div>
        </Card>

        <Card>
          <StepLabel n="02" kicker="Deploy" />
          <h3 className="mb-3 font-display text-2xl font-bold">Rewards fund the long.</h3>
          <div className="space-y-2">
            <Row left="Creator rewards" right="collected (SOL)" />
            <div className="grid place-items-center py-1 text-accent">↓</div>
            <Row left="AsterDex" right="10x long · Ansem" />
          </div>
        </Card>

        <Card>
          <StepLabel n="03" kicker="Ride" />
          <h3 className="mb-3 font-display text-2xl font-bold">Watch it ride.</h3>
          <div className="space-y-2">
            <Row left="Position" right="Long · 10x" />
            <Row left="Unrealized PnL" right="live on dashboard" />
            <Row left="Every fee" right="comes home → long" />
          </div>
        </Card>
      </div>
    </section>
  );
}
