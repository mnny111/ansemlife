import Link from "next/link";
import { HowItWorks } from "@/components/HowItWorks";
import { Disclaimer } from "@/components/Disclaimer";

export default function Home() {
  const wallet = process.env.REWARD_WALLET_ADDRESS ?? "";
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 space-y-14">
      <header className="space-y-4">
        <h1 className="text-5xl font-extrabold tracking-tight">AnsemLife</h1>
        <p className="text-xl text-white/70 max-w-2xl">
          Every creator reward from the AnsemLife coin is deployed into a 10x long on the target token, read live from AsterDex. Transparent and on-chain.
        </p>
        <div className="flex gap-3">
          <Link href="/dashboard" className="rounded-lg bg-emerald-500 px-5 py-2 font-semibold text-black">View the live dashboard</Link>
        </div>
      </header>
      <HowItWorks />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Transparency</h2>
        <p className="text-sm text-white/60">
          Reward wallet:{" "}
          {wallet ? (
            <a className="text-emerald-400 underline" href={`https://solscan.io/account/${wallet}`} target="_blank" rel="noreferrer">{wallet}</a>
          ) : "not configured"}
        </p>
      </section>
      <Disclaimer />
    </main>
  );
}
