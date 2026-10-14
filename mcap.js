// Live market cap from pump.fun.
// Put the coin's contract address (mint) here on launch day.
// For testing, any page also accepts ?ca=<address> in the URL.
const TRENCHTOK_CA = "ng6pDHNYmSW7Sf2rr6Z2yrAGexVQ4SMRXc1v9Khpump";

(() => {
  const REFRESH_MS = 5000;
  // pump.fun only answers browsers on localhost. Everywhere else, go through
  // the site's own /api/pump function (api/pump.js), which asks pump.fun for us.
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
  const coinUrl = (ca) => LOCAL
    ? `https://frontend-api-v3.pump.fun/coins-v2/${ca}`
    : `/api/pump?ca=${ca}`;
  const candleUrl = (ca, interval, limit, createdTs) => LOCAL
    ? `https://swap-api.pump.fun/v2/coins/${ca}/candles?interval=${interval}&limit=${limit}&currency=USD&createdTs=${createdTs}`
    : `/api/pump?ca=${ca}&candles=1&interval=${interval}&limit=${limit}&createdTs=${createdTs}`;

  const ca = (new URLSearchParams(location.search).get("ca") || TRENCHTOK_CA).trim();

  const fmt = (n) => {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(0);
  };
  const utc = (t) => new Date(t).toISOString().slice(11, 16) + " UTC";

  // Number readouts: <span data-mcap></span>
  const readouts = [...document.querySelectorAll("[data-mcap]")].map((el) => {
    el.classList.add("mc");
    el.innerHTML = '<span class="mc-base">&ndash;</span><span class="mc-flash" aria-hidden="true"></span>';
    return el;
  });

  const chart = document.getElementById("mcap-chart");
  const status = document.getElementById("mcap-status");
  const caBtn = document.getElementById("ca");

  if (caBtn && ca) {
    caBtn.textContent = ca;
    caBtn.dataset.address = ca;
  }

  const setStatus = (msg) => { if (status) status.textContent = msg || ""; };

  const flash = (el, dir) => {
    el.classList.remove("flashing", "up", "down");
    void el.getBoundingClientRect(); // restart the animation
    el.classList.add("flashing", dir);
  };

  const setReadouts = (text) => readouts.forEach((el) => {
    el.querySelector(".mc-base").textContent = text;
    el.querySelector(".mc-flash").textContent = text;
  });

  const drawChart = (points) => {
    if (!chart || points.length < 2) return;
    const W = 666, TOP = 10, BOT = 180;
    const vs = points.map((p) => p.v);
    let min = Math.min(...vs), max = Math.max(...vs);
    if (max === min) { max *= 1.01; min *= 0.99; }
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    const x = (t) => ((t - t0) / (t1 - t0)) * W;
    const y = (v) => BOT - ((v - min) / (max - min)) * (BOT - TOP);
    const d = points.map((p, i) => (i ? "L" : "M") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
    const last = points[points.length - 1];

    chart.querySelectorAll(".mc-line").forEach((el) => el.setAttribute("d", d));
    chart.querySelector(".mc-area").setAttribute("d", d + ` L${W} ${BOT} L0 ${BOT} Z`);
    chart.querySelectorAll(".mc-dot").forEach((el) => {
      el.setAttribute("cx", x(last.t).toFixed(1));
      el.setAttribute("cy", y(last.v).toFixed(1));
      el.style.display = "";
    });
    chart.querySelector(".y-max").textContent = fmt(max);
    chart.querySelector(".y-mid").textContent = fmt((max + min) / 2);
    chart.querySelector(".y-min").textContent = fmt(min);
    chart.querySelector(".x-start").textContent = utc(t0);
    chart.querySelector(".x-mid").textContent = utc((t0 + t1) / 2);
    chart.querySelector(".x-end").textContent = "now";
    chart.setAttribute("aria-label", `Market cap since ${utc(t0)}, from ${fmt(points[0].v)} to ${fmt(last.v)}`);
  };

  let prev = null;
  let timer = null;

  const getJSON = async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) { const e = new Error(res.status); e.status = res.status; throw e; }
    return res.json();
  };

  const refresh = async () => {
    clearTimeout(timer);
    try {
      const coin = await getJSON(coinUrl(ca));
      const mcap = Number(coin.usd_market_cap ?? coin.market_cap_usd);
      const supply = Number(coin.total_supply) / 10 ** Number(coin.base_decimals ?? 6);

      // Young coins get 1-minute candles (last 5 hours), older ones 5-minute candles (last 24 hours).
      const young = Date.now() - coin.created_timestamp < 5 * 3600e3;
      const candles = await getJSON(candleUrl(ca, young ? "1m" : "5m", young ? 300 : 288, coin.created_timestamp));
      const points = candles.map((c) => ({ t: c.timestamp, v: parseFloat(c.close) * supply }));
      points.push({ t: Date.now(), v: mcap });

      setReadouts(fmt(mcap));
      drawChart(points);
      setStatus("");

      if (prev !== null && mcap !== prev) {
        const dir = mcap > prev ? "up" : "down";
        readouts.forEach((el) => flash(el, dir));
        if (chart) flash(chart, dir);
      }
      prev = mcap;
    } catch (err) {
      if (err.status === 404) setStatus("pump.fun has no coin at this address. Check the contract address in mcap.js.");
      else if (prev === null) setStatus("Can't reach pump.fun right now. Trying again every 5 seconds.");
    }
    if (!document.hidden) timer = setTimeout(refresh, REFRESH_MS);
  };

  if (!ca) {
    setStatus("The chart goes live when the coin launches on pump.fun.");
    return;
  }

  // Pause while the tab is hidden, catch up as soon as it is visible again.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else refresh();
  });
  refresh();
})();
