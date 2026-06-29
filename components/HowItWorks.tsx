const STEPS = [
  { n: "1", title: "Coin earns rewards", body: "The AnsemLife pump.fun coin accrues creator rewards on every trade." },
  { n: "2", title: "Rewards deposited", body: "Rewards are collected to a public Solana wallet and deposited to AsterDex." },
  { n: "3", title: "Deployed into a 10x long", body: "Collected rewards fund a 10x long on the target token, read live via a read-only key." },
];

export function HowItWorks() {
  return (
    <section className="grid gap-4 sm:grid-cols-3 max-w-5xl">
      {STEPS.map((s) => (
        <div key={s.n} className="rounded-xl border border-white/10 p-5">
          <div className="text-emerald-400 font-mono">{s.n}</div>
          <h3 className="font-semibold mt-2">{s.title}</h3>
          <p className="text-sm text-white/60 mt-1">{s.body}</p>
        </div>
      ))}
    </section>
  );
}
