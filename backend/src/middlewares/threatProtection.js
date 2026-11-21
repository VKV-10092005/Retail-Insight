const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_BLOCK_MS = 15 * 60 * 1000;
const DEFAULT_MAX_NOT_FOUND = 12;

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createNotFoundScannerGuard({
  windowMs = DEFAULT_WINDOW_MS,
  blockMs = DEFAULT_BLOCK_MS,
  maxNotFound = DEFAULT_MAX_NOT_FOUND,
  now = () => Date.now()
} = {}) {
  const clients = new Map();

  return function notFoundScannerGuard(req, res, next) {
    const key = clientKey(req);
    const timestamp = now();
    const previous = clients.get(key);
    const recentMisses = previous?.misses?.filter(value => timestamp - value < windowMs) || [];
    const blockedUntil = Number(previous?.blockedUntil || 0);

    if (blockedUntil > timestamp) {
      res.set('Retry-After', String(Math.ceil((blockedUntil - timestamp) / 1000)));
      return res.status(429).json({message:'Quá nhiều đường dẫn không hợp lệ. Vui lòng thử lại sau.'});
    }

    if (previous && !recentMisses.length) clients.delete(key);

    res.once('finish', () => {
      const finishedAt = now();
      if (res.statusCode === 404) {
        const current = clients.get(key);
        const misses = (current?.misses || recentMisses).filter(value => finishedAt - value < windowMs);
        misses.push(finishedAt);
        clients.set(key, {
          misses,
          blockedUntil: misses.length >= maxNotFound ? finishedAt + blockMs : 0
        });
      } else if (res.statusCode < 400) {
        // A valid API request breaks a consecutive path-scanning sequence.
        clients.delete(key);
      }

      if (clients.size > 10_000) {
        for (const [candidate, state] of clients) {
          const active = state.blockedUntil > finishedAt || state.misses.some(value => finishedAt - value < windowMs);
          if (!active) clients.delete(candidate);
          if (clients.size <= 8_000) break;
        }
      }
    });

    next();
  };
}
