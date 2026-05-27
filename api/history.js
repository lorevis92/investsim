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
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const currency = result.meta?.currency ?? '';

  const data = timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 7),
      price: closes[i] != null ? parseFloat(closes[i].toFixed(2)) : null,
    }))
    .filter((d) => d.price != null);

  if (!data.length) {
    return new Response(JSON.stringify({ error: 'No price data available' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ data, currency }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
