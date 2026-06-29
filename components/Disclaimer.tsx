import { RISK_DISCLAIMER } from "@/lib/constants";

export function Disclaimer() {
  return (
    <p className="text-xs text-yellow-300/80 border border-yellow-700/50 rounded-md p-3 max-w-3xl">
      {RISK_DISCLAIMER}
    </p>
  );
}
