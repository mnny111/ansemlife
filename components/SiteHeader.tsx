import Link from "next/link";
import { CopyCA } from "@/components/CopyCA";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-black">A</span>
          <span className="text-lg">
            Ansem<span className="text-accent">Life</span>
          </span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-lg px-3 py-1.5 text-white/70 hover:text-white">
            Home
          </Link>
          <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-white/70 hover:text-white">
            Dashboard
          </Link>
          <span className="ml-2">
            <CopyCA />
          </span>
        </div>
      </nav>
    </header>
  );
}
