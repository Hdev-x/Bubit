// 런타임 타입 가드 — unknown 값을 as-cast 없이 좁힌다 .

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 오류 본문 { error } 또는 Error 객체에서 사용자용 메시지 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message || fallback;
  if (isRecord(e) && typeof e.error === 'string') return e.error;
  if (isRecord(e) && typeof e.message === 'string') return e.message;
  return fallback;
}
