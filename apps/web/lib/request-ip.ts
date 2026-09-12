export function clientIp(req: Request) {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const nearest = parts.at(-1);
    if (nearest) return nearest;
  }
  return 'unknown';
}
