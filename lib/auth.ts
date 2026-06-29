import { timingSafeEqual } from "node:crypto";

export function verifyBearer(authHeader: string | null, expected: string): boolean {
  if (!expected || !authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
