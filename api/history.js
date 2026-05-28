export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let symbol;
  try {
    ({ symbol } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!symbol?.trim()) {
    return new Response(JSON.stringify({ error: 'Symbol required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ticker = symbol.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=30y`;

  console.log(`[history] Fetching: ${url}`);

  let yahooRes;
  try {
    yahooRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Network error fetching historical data' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!yahooRes.ok) {
    return new Response(JSON.stringify({ error: `Yahoo Finance returned ${yahooRes.status}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let yahooData;
  try {
    yahooData = await yahooRes.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to parse response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = yahooData?.chart?.result?.[0];
  if (!result) {
    const errMsg = yahooData?.chart?.error?.description ?? 'No data found for this symbol';
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const timestamps = result.timestamp ?? [];
  const closes    = result.indicators?.quote?.[0]?.close ?? [];
  const adjCloses = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const currency  = result.meta?.currency ?? '';

  // Log raw data for debugging — first 5 and last 5 values
  const first5ts = timestamps.slice(0, 5).map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 7),
    close: closes[i],
    adjclose: adjCloses[i],
  }));
  const last5ts = timestamps.slice(-5).map((ts, i) => {
    const idx = timestamps.length - 5 + i;
    return {
      date: new Date(ts * 1000).toISOString().slice(0, 7),
      close: closes[idx],
      adjclose: adjCloses[idx],
    };
  });
  console.log(`[history] ${ticker} — ${timestamps.length} data points`);
  console.log(`[history] Date range: ${first5ts[0]?.date} → ${last5ts[last5ts.length - 1]?.date}`);
  console.log(`[history] First 5 raw:`, JSON.stringify(first5ts));
  console.log(`[history] Last 5 raw:`, JSON.stringify(last5ts));

  // Use close prices; adjclose is preferred for stocks but close is more reliable
  // for crypto (Yahoo sometimes returns null adjclose for crypto)
  const priceSource = closes.some((v) => v != null) ? closes : adjCloses;

  const data = timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 7),
      price: priceSource[i] != null ? parseFloat(priceSource[i].toFixed(2)) : null,
    }))
    .filter((d) => d.price != null && d.price > 0);

  if (!data.length) {
    return new Response(JSON.stringify({ error: 'No price data available' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Log CAGR debug for each standard period
  const lastPoint  = data[data.length - 1];
  const lastPrice  = lastPoint.price;
  const lastYear   = parseInt(lastPoint.date.slice(0, 4));
  const lastMoPad  = lastPoint.date.slice(5, 7);

  for (const years of [5, 10, 15, 20, 25, 30]) {
    const targetDate = `${lastYear - years}-${lastMoPad}`;
    const entry = data.find((d) => d.date >= targetDate);
    if (!entry) {
      console.log(`[history] CAGR ${years}Y: no data (history too short — earliest: ${data[0].date})`);
      continue;
    }
    const cagr = ((Math.pow(lastPrice / entry.price, 1 / years) - 1) * 100).toFixed(1);
    console.log(`[history] CAGR ${years}Y: start ${entry.date} @ ${entry.price} → end ${lastPoint.date} @ ${lastPrice} = ${cagr}%`);
  }

  return new Response(JSON.stringify({ data, currency }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
