"use client";
import { useState } from "react";

export function CopyCA() {
  const ca = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";
  const value = ca.length > 0 ? ca : "TBA";
  const isTba = value === "TBA";
  const [copied, setCopied] = useState(false);

  const label = copied ? "Copied!" : isTba ? "TBA" : `${value.slice(0, 4)}…${value.slice(-4)}`;

  async function onCopy() {
    if (isTba) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      title={isTba ? "Contract address coming soon" : `Copy ${value}`}
      className={`rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent ${
        isTba ? "cursor-default" : "hover:bg-accent/20"
      }`}
    >
      CA: {label}
    </button>
  );
}
