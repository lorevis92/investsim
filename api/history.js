import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const TTL_HISTORY = 24 * 60 * 60 * 1000; // 24 hours

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

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

  const ticker   = symbol.trim().toUpperCase();
  const supabase = getSupabase();
  const now      = Date.now();

  // ── Check Supabase cache ────────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from('stocks')
    .select('yahoo_symbol, history_data, history_updated_at')
    .eq('symbol', ticker)
    .maybeSingle();

  const historyAge    = cached?.history_updated_at ? now - new Date(cached.history_updated_at).getTime() : Infinity;
  const historyCached = cached?.history_data != null && historyAge < TTL_HISTORY;

  if (historyCached) {
    console.log(`[history] Cache HIT: ${ticker} (age ${Math.round(historyAge / 3600000)}h)`);
    return new Response(JSON.stringify(cached.history_data), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Use yahoo_symbol from DB if available (e.g. BTC-USD for BTC, ^GSPC for S&P 500)
  const yahooTicker = cached?.yahoo_symbol ?? ticker;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1mo&range=30y`;

  console.log(`[history] Cache MISS for ${ticker} — fetching Yahoo: ${url}`);

  let yahooRes;
  try {
    yahooRes = await fetch(url, { headers: YAHOO_HEADERS });
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
  const closes     = result.indicators?.quote?.[0]?.close ?? [];
  const adjCloses  = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const currency   = result.meta?.currency ?? '';

  // Log raw sample for debugging
  const sample = timestamps.slice(0, 3).map((ts, i) => ({
    date:     new Date(ts * 1000).toISOString().slice(0, 7),
    close:    closes[i],
    adjclose: adjCloses[i],
  }));
  console.log(`[history] ${yahooTicker} — ${timestamps.length} points, sample:`, JSON.stringify(sample));

  // Prefer close; fall back to adjclose (close is more reliable for crypto)
  const priceSource = closes.some((v) => v != null) ? closes : adjCloses;

  const data = timestamps
    .map((ts, i) => ({
      date:  new Date(ts * 1000).toISOString().slice(0, 7),
      price: priceSource[i] != null ? parseFloat(priceSource[i].toFixed(2)) : null,
    }))
    .filter((d) => d.price != null && d.price > 0);

  if (!data.length) {
    return new Response(JSON.stringify({ error: 'No price data available' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[history] Date range: ${data[0].date} → ${data[data.length - 1].date} (${data.length} points)`);

  // Log CAGR for each standard period
  const lastPoint = data[data.length - 1];
  const lastPrice = lastPoint.price;
  const lastYear  = parseInt(lastPoint.date.slice(0, 4));
  const lastMoPad = lastPoint.date.slice(5, 7);

  for (const years of [5, 10, 15, 20, 25, 30]) {
    const targetDate = `${lastYear - years}-${lastMoPad}`;
    const entry = data.find((d) => d.date >= targetDate);
    if (!entry) {
      console.log(`[history] CAGR ${years}Y: no data (earliest: ${data[0].date})`);
      continue;
    }
    const cagr = ((Math.pow(lastPrice / entry.price, 1 / years) - 1) * 100).toFixed(1);
    console.log(`[history] CAGR ${years}Y: ${entry.date} @ ${entry.price} → ${lastPoint.date} @ ${lastPrice} = ${cagr}%`);
  }

  const payload = { data, currency };

  // Persist to Supabase — only update if the stock row already exists
  if (cached !== null) {
    const { error: saveErr } = await supabase
      .from('stocks')
      .update({
        history_data:       payload,
        history_updated_at: new Date(now).toISOString(),
      })
      .eq('symbol', ticker);
    if (saveErr) console.log(`[history] Cache save error for ${ticker}:`, saveErr.message);
    else console.log(`[history] Cached history for ${ticker} (${data.length} points)`);
  } else {
    console.log(`[history] ${ticker} not in stocks table — skipping history cache`);
  }

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
}
