import { PositionSnapshotSchema, type PositionSnapshot } from "./position";

export type KvLike = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
};

const HISTORY_KEY = "ansemlife:snapshot-history";

export async function getHistory(kv: KvLike): Promise<PositionSnapshot[]> {
  const data = await kv.get<PositionSnapshot[]>(HISTORY_KEY);
  return data ?? [];
}

export async function appendSnapshot(kv: KvLike, snapshot: PositionSnapshot): Promise<PositionSnapshot[]> {
  const valid = PositionSnapshotSchema.parse(snapshot);
  const history = await getHistory(kv);
  const next = [...history, valid];
  await kv.set(HISTORY_KEY, next);
  return next;
}
