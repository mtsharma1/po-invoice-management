// APP_ORIGIN accepts a comma-separated list of public browser origins.
// Never trust forwarded headers to choose which origins may submit mutations.
export function isSameOriginRequest(request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || origin === 'null') return false;
    const allowed = (process.env.APP_ORIGIN || new URL(request.url).origin)
      .split(',').map(value => {
        const url = new URL(value.trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
            || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid app origin');
        return url.origin;
      });
    return allowed.includes(origin);
  } catch {
    return false;
  }
}
