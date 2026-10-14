// Fetches pump.fun data on the server, because pump.fun refuses browser
// requests from other websites. The page calls /api/pump instead.
//   /api/pump?ca=<address>                                    -> coin info
//   /api/pump?ca=<address>&candles=1&interval=&limit=&createdTs= -> price candles

const COIN_API = "https://frontend-api-v3.pump.fun/coins-v2/";
const CANDLE_API = "https://swap-api.pump.fun/v2/coins/";

module.exports = async (req, res) => {
  const { ca = "", candles, interval = "5m", limit = "288", createdTs = "" } = req.query;

  // Only Solana addresses, so this can't be used to fetch anything else.
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca)) {
    return res.status(400).json({ error: "Invalid contract address" });
  }

  let url = COIN_API + ca;
  if (candles) {
    if (!["1m", "5m", "15m", "1h"].includes(interval) || !/^\d{1,4}$/.test(limit) || !/^\d{10,14}$/.test(createdTs)) {
      return res.status(400).json({ error: "Invalid candle parameters" });
    }
    url = `${CANDLE_API}${ca}/candles?interval=${interval}&limit=${limit}&currency=USD&createdTs=${createdTs}`;
  }

  try {
    const upstream = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    const body = await upstream.text();
    // Vercel's CDN shares each answer for a few seconds, so pump.fun is asked
    // at most about once per refresh no matter how many people are on the site.
    res.setHeader("Cache-Control", upstream.ok ? "public, s-maxage=4, stale-while-revalidate=10" : "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(upstream.status).send(body);
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Could not reach pump.fun" });
  }
};
