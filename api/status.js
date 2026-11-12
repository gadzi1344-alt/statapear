// Vercel Serverless Function: GET /api/status
// Проверяет сайт и забирает метрики у агента на VPS.
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   SITE_URL     адрес сайта, по умолчанию https://peargram.online
//   AGENT_URL    адрес агента, например https://agent.peargram.online/metrics
//   AGENT_TOKEN  тот же секрет, что и на сервере

async function timed(url, options, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: ctl.signal });
    return { res, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSite(url) {
  try {
    const { res, ms } = await timed(url, { redirect: 'follow', headers: { 'user-agent': 'PearGram-Status/1.0' } }, 8000);
    return { up: res.status < 500, status: res.status, ms };
  } catch {
    return { up: false, status: 0, ms: 0 };
  }
}

async function checkAgent(url, token) {
  if (!url) return { configured: false, server: null };
  try {
    const { res } = await timed(url, { headers: { authorization: `Bearer ${token || ''}` } }, 4000);
    if (!res.ok) return { configured: true, server: null };
    return { configured: true, server: await res.json() };
  } catch {
    return { configured: true, server: null };
  }
}

module.exports = async (req, res) => {
  const [site, agent] = await Promise.all([
    checkSite(process.env.SITE_URL || 'https://peargram.online'),
    checkAgent(process.env.AGENT_URL, process.env.AGENT_TOKEN),
  ]);

  // Кэш на краю сети: сколько бы людей ни открыло страницу, VPS опрашивается примерно раз в 4 секунды.
  res.setHeader('Cache-Control', 'public, s-maxage=4, stale-while-revalidate=10');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify({ time: Date.now(), site, ...agent }));
};
