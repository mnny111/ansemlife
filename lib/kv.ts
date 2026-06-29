import { kv } from "@vercel/kv";
import type { KvLike } from "./store";

export const vercelKv: KvLike = {
  get: <T>(key: string) => kv.get<T>(key),
  set: (key, value) => kv.set(key, value),
  setNx: async (key, value, ttlMs) => (await kv.set(key, value, { nx: true, px: ttlMs })) === "OK",
};
