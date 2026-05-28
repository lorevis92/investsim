import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const RETURN_BENCHMARKS = {
  etf_global:       { pessimistic: 5,   base: 9,  optimistic: 12 },
  etf_sp500:        { pessimistic: 6,   base: 11, optimistic: 14 },
  etf_nasdaq:       { pessimistic: 7,   base: 15, optimistic: 20 },
  large_cap_stable: { pessimistic: 8,   base: 13, optimistic: 20 },
  growth_tech:      { pessimistic: 5,   base: 18, optimistic: 35 },
  small_mid_cap:    { pessimistic: 5,   base: 12, optimistic: 22 },
  bonds:            { pessimistic: 2,   base: 4,  optimistic: 6  },
  crypto_etf:       { pessimistic: -10, base: 25, optimistic: 70 },
  speculative:      { pessimistic: -20, base: 12, optimistic: 45 },
};

const TTL_AI    = 90 * 24 * 60 * 60 * 1000; // 90 days
const TTL_PRICE = 15 * 60 * 1000;            // 15 minutes

const SYSTEM_PROMPT = `IMPORTANT: Always respond in English. All text fields (description, explanation, historical, currentContext, riskFactors, methodology) must be written in English regardless of the language used in the search query.

You are an expert financial assistant. The user is searching for a stock, ETF, or index to simulate a long-term DCA investment.
Respond ONLY with a valid JSON object — no additional text, no markdown, no backticks.
The JSON must have this exact structure:
{
  "symbol": "TICKER",
  "yahoo_symbol": "TICKER_FOR_YAHOO_FINANCE",
  "name": "Full name",
  "type": "ETF|Stock|Index",
  "category": "etf_global|etf_sp500|etf_nasdaq|large_cap_stable|growth_tech|small_mid_cap|bonds|crypto_etf|speculative",
  "currency": "USD",
  "description": "Brief description 2-3 sentences",
  "risk": "Low|Medium|High|Very High",
  "sector": "Technology|Finance|etc",
  "explanation": {
    "historical": "Describe in simple language the historical performance of this asset over the last 20-30 years — no financial jargon",
    "currentContext": "Current context of the asset — sector, momentum, valuation — in 2-3 sentences accessible to non-investors",
    "riskFactors": "The main factors that could make it perform better or worse — in 2-3 simple sentences",
    "methodology": "Explain that the returns shown are nominal (what you see in the account, before inflation) and how the three pessimistic, base, optimistic scenarios were built based on real 20-30 year historical benchmarks"
  }
}
Guidelines for yahoo_symbol:
- For most stocks and ETFs: yahoo_symbol equals symbol (e.g. AAPL, VOO, QQQ, VWCE.DE)
- For cryptocurrencies: append -USD (e.g. BTC → BTC-USD, ETH → ETH-USD, SOL → SOL-USD)
- For major indices: use Yahoo Finance ticker (e.g. S&P 500 → ^GSPC, Nasdaq Composite → ^IXIC, Dow Jones → ^DJI)
Category guidelines:
- etf_global: ETFs on diversified global indices (MSCI World, All World, VT, VWCE)
- etf_sp500: ETFs on S&P 500 (SPY, VOO, IVV, CSPX)
- etf_nasdaq: ETFs on Nasdaq (QQQ, QQQM, EQQQ)
- large_cap_stable: Large stable blue-chip stocks (Apple, Microsoft, Berkshire, Johnson & Johnson, Nestlé)
- growth_tech: High-growth or aggressive tech stocks (NVIDIA, Tesla, Amazon, Meta)
- small_mid_cap: Small to mid-cap stocks
- bonds: Bonds, bond ETFs, government bonds
- crypto_etf: Cryptocurrency ETFs or direct crypto (Bitcoin ETF, Ethereum ETF, BTC, ETH)
- speculative: Everything else — speculative assets, sector indices, commodities, unclassifiable assets
For vague or not-found requests, set symbol: "NOT_FOUND" and category: "speculative".`;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

async function fetchCurrentPrice(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((v) => v != null);
    if (!validCloses.length) return null;
    const price = parseFloat(validCloses[validCloses.length - 1].toFixed(2));
    const currency = result.meta?.currency ?? 'USD';
    return { price, currency };
  } catch {
    return null;
  }
}

function buildResponse(row) {
  const category = row.category ?? 'speculative';
  const returns = RETURN_BENCHMARKS[category] ?? RETURN_BENCHMARKS.speculative;
  return {
    symbol:       row.symbol,
    yahoo_symbol: row.yahoo_symbol ?? row.symbol,
    name:         row.name,
    type:         row.type,
    category,
    returns,
    risk:         row.risk,
    sector:       row.sector,
    description:  row.description,
    currentPrice: row.current_price ?? null,
    currency:     row.currency ?? null,
    explanation:  row.explanation ?? null,
  };
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let query;
  try {
    ({ query } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!query?.trim()) {
    return new Response(JSON.stringify({ error: 'Query required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = getSupabase();
  const now = Date.now();
  const q = query.trim();

  // --- Look up existing DB record (no global TTL — each layer checks its own) ---
  let cached = null;

  // 1. Exact symbol match
  const { data: exactMatch } = await supabase
    .from('stocks')
    .select('*')
    .eq('symbol', q.toUpperCase())
    .not('name', 'is', null)
    .maybeSingle();
  cached = exactMatch ?? null;

  // 2. Name ILIKE fallback
  if (!cached) {
    const { data: nameMatch } = await supabase
      .from('stocks')
      .select('*')
      .ilike('name', `%${q}%`)
      .not('name', 'is', null)
      .limit(1);
    cached = nameMatch?.[0] ?? null;
  }

  // Working row — merged in-memory as each layer resolves
  let row = cached ? { ...cached } : {};

  // ── Layer 1: AI data (TTL 90 days) ──────────────────────────────────────────
  const aiAge   = cached?.ai_updated_at ? now - new Date(cached.ai_updated_at).getTime() : Infinity;
  const aiStale = aiAge > TTL_AI;

  if (!aiStale) {
    console.log(`[search] AI cache HIT: ${row.symbol} (age ${Math.round(aiAge / 86400000)}d)`);
  } else {
    console.log(`[search] AI cache MISS for "${q}" — calling Claude`);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Search: ${query}` }],
      }),
    });

    if (!anthropicRes.ok) {
      return new Response(JSON.stringify({ error: 'Upstream API error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const claudeJson = await anthropicRes.json();
    const text = claudeJson.content?.find((b) => b.type === 'text')?.text || '{}';

    let aiResult;
    try {
      aiResult = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      return new Response(JSON.stringify({ error: 'Parse error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!aiResult.symbol || aiResult.symbol === 'NOT_FOUND') {
      return new Response(JSON.stringify({ symbol: 'NOT_FOUND' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const returns   = RETURN_BENCHMARKS[aiResult.category] ?? RETURN_BENCHMARKS.speculative;
    const aiFields  = {
      symbol:             aiResult.symbol,
      yahoo_symbol:       aiResult.yahoo_symbol ?? aiResult.symbol,
      name:               aiResult.name,
      type:               aiResult.type,
      category:           aiResult.category,
      risk:               aiResult.risk,
      sector:             aiResult.sector,
      description:        aiResult.description,
      explanation:        aiResult.explanation ?? null,
      return_pessimistic: returns.pessimistic,
      return_base:        returns.base,
      return_optimistic:  returns.optimistic,
      ai_updated_at:      new Date(now).toISOString(),
    };

    await supabase.from('stocks').upsert(aiFields, { onConflict: 'symbol' });
    console.log(`[search] AI upserted: ${aiFields.symbol} (yahoo: ${aiFields.yahoo_symbol})`);

    row = { ...row, ...aiFields };
  }

  // ── Layer 2: Current price (TTL 15 minutes) ──────────────────────────────────
  const priceAge   = row.price_updated_at ? now - new Date(row.price_updated_at).getTime() : Infinity;
  const priceStale = priceAge > TTL_PRICE;

  if (!priceStale) {
    console.log(`[search] Price cache HIT: ${row.symbol} @ ${row.current_price} ${row.currency} (age ${Math.round(priceAge / 60000)}min)`);
  } else {
    const yahooSym = row.yahoo_symbol ?? row.symbol;
    console.log(`[search] Price cache MISS for ${yahooSym} — fetching from Yahoo`);

    const priceInfo = await fetchCurrentPrice(yahooSym);
    if (priceInfo) {
      console.log(`[search] Yahoo price: ${priceInfo.price} ${priceInfo.currency}`);
      const priceFields = {
        symbol:           row.symbol,
        current_price:    priceInfo.price,
        currency:         priceInfo.currency,
        price_updated_at: new Date(now).toISOString(),
      };
      await supabase.from('stocks').upsert(priceFields, { onConflict: 'symbol' });
      row = { ...row, ...priceFields };
    } else {
      console.log(`[search] Yahoo price fetch failed for ${yahooSym}`);
    }
  }

  return new Response(JSON.stringify(buildResponse(row)), {
    headers: { 'Content-Type': 'application/json' },
  });
}
