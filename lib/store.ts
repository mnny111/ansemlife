import { PositionSnapshotSchema, type PositionSnapshot } from "./position";

export type KvLike = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
};

const HISTORY_KEY = "ansemlife:snapshot-history";

// Maximum number of snapshots retained in KV storage.
export const MAX_HISTORY = 1000;

export async function getHistory(kv: KvLike): Promise<PositionSnapshot[]> {
  const data = await kv.get<PositionSnapshot[]>(HISTORY_KEY);
  return data ?? [];
}

export async function appendSnapshot(kv: KvLike, snapshot: PositionSnapshot): Promise<PositionSnapshot[]> {
  const valid = PositionSnapshotSchema.parse(snapshot);
  const history = await getHistory(kv);
  const next = [...history, valid];
  // Cap to most recent MAX_HISTORY entries to prevent unbounded KV growth.
  const capped = next.slice(-MAX_HISTORY);
  await kv.set(HISTORY_KEY, capped);
  return capped;
}
