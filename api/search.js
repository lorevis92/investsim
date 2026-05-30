import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const RETURN_BENCHMARKS = {
  // Current categories
  GLOBAL_ETF:         { pessimistic: 3,   base: 7,   optimistic: 10 },
  SP500_ETF:          { pessimistic: 4,   base: 9,   optimistic: 13 },
  NASDAQ_ETF:         { pessimistic: 6,   base: 12,  optimistic: 17 },
  SECTOR_ETF:         { pessimistic: 3,   base: 10,  optimistic: 16 },
  BOND_ETF:           { pessimistic: 1,   base: 4,   optimistic: 6  },
  DIVIDEND_ETF:       { pessimistic: 4,   base: 8,   optimistic: 11 },
  MEGA_CAP_STABLE:    { pessimistic: 6,   base: 11,  optimistic: 15 },
  MEGA_CAP_GROWTH:    { pessimistic: 7,   base: 14,  optimistic: 21 },
  LARGE_CAP_STABLE:   { pessimistic: 5,   base: 9,   optimistic: 14 },
  LARGE_CAP_GROWTH:   { pessimistic: 6,   base: 13,  optimistic: 19 },
  MID_SMALL_CAP:      { pessimistic: 3,   base: 11,  optimistic: 19 },
  CYCLICAL_SECTOR:    { pessimistic: 2,   base: 10,  optimistic: 18 },
  SPECULATIVE_GROWTH: { pessimistic: -2,  base: 11,  optimistic: 23 },
  CRYPTO_MAJOR:       { pessimistic: 2,   base: 15,  optimistic: 26 },
  CRYPTO_ALT:         { pessimistic: -5,  base: 10,  optimistic: 28 },
  COMMODITY_ETF:      { pessimistic: 2,   base: 5,   optimistic: 8  },
  REAL_ESTATE:        { pessimistic: 4,   base: 7,   optimistic: 11 },
  // Legacy fallbacks for old cached records
  etf_global:         { pessimistic: 3,   base: 7,   optimistic: 10 },
  etf_sp500:          { pessimistic: 4,   base: 9,   optimistic: 13 },
  etf_nasdaq:         { pessimistic: 6,   base: 12,  optimistic: 17 },
  large_cap_stable:   { pessimistic: 6,   base: 11,  optimistic: 15 },
  growth_tech:        { pessimistic: 7,   base: 14,  optimistic: 21 },
  small_mid_cap:      { pessimistic: 3,   base: 11,  optimistic: 19 },
  bonds:              { pessimistic: 1,   base: 4,   optimistic: 6  },
  crypto_etf:         { pessimistic: 2,   base: 15,  optimistic: 26 },
  speculative:        { pessimistic: -2,  base: 11,  optimistic: 23 },
};

const TTL_AI    = 30 * 24 * 60 * 60 * 1000; // 30 days
const TTL_PRICE = 15 * 60 * 1000;            // 15 minutes

const SYSTEM_PROMPT = `You are a professional financial analyst assistant embedded in an investment
simulation app called WisiInvest. Your job is to analyze a stock, ETF, crypto,
or index and return a structured JSON with realistic forward-looking return
estimates for long-term compound interest simulations (10-30 year horizon).

Your estimates must be intellectually honest, defensible, and educational.
Users are learning about investing — misleading numbers damage their
financial education and your credibility.

═══════════════════════════════════════════════════════════
SECTION 1 — ASSET CLASSIFICATION
═══════════════════════════════════════════════════════════

First, classify the asset into one of these categories:

- GLOBAL_ETF         → Diversified global equity (VT, MSCI World, FTSE All-World)
- SP500_ETF          → S&P 500 trackers (VOO, IVV, SPY)
- NASDAQ_ETF         → Nasdaq / tech-heavy ETF (QQQ, QQQM)
- SECTOR_ETF         → Sector-specific ETF (XLK, XLE, ARKK, etc.)
- BOND_ETF           → Bond or fixed income ETF
- DIVIDEND_ETF       → High-dividend or value ETF (VYM, SCHD)
- MEGA_CAP_STABLE    → Mega-cap with stable, mature growth (MSFT, AAPL, GOOGL post-2015)
- MEGA_CAP_GROWTH    → Mega-cap still in strong growth phase (NVDA, META post-2022)
- LARGE_CAP_STABLE   → Large-cap, established business, moderate growth
- LARGE_CAP_GROWTH   → Large-cap with above-average growth trajectory
- MID_SMALL_CAP      → Mid or small cap, higher risk/reward
- CYCLICAL_SECTOR    → Heavily cyclical (semiconductors, energy, materials, shipping)
- SPECULATIVE_GROWTH → High-growth speculative (recent IPO, pre-profit, high P/E >50)
- CRYPTO_MAJOR       → Bitcoin, Ethereum — established crypto with liquidity
- CRYPTO_ALT         → Altcoins, smaller crypto — very high risk
- COMMODITY_ETF      → Gold, silver, oil trackers
- REAL_ESTATE        → REITs or real estate ETFs

═══════════════════════════════════════════════════════════
SECTION 2 — HISTORICAL DATA QUALITY ASSESSMENT
═══════════════════════════════════════════════════════════

Before estimating returns, you MUST evaluate the quality and
reliability of the historical data. Apply these filters:

── 2A. HISTORY LENGTH CHECK ──
  • < 5 years of history  → DO NOT use historical CAGR.
    Use asset class benchmark only. Flag as: "INSUFFICIENT_HISTORY"
  • 5–10 years            → Use with caution. Flag as: "LIMITED_HISTORY"
  • 10–20 years           → Acceptable, check for distortions below
  • > 20 years            → Reliable base, still check distortions

── 2B. DISCOVERY PHASE DISTORTION ──
  Check if the early years of history are a "discovery phase" —
  a period when the asset was illiquid, unknown, or priced
  near zero, creating artificially inflated CAGR.

  Indicators:
  • Crypto assets before 2017 (pre-institutional awareness)
  • Penny stocks or micro-caps before achieving real liquidity
  • Any asset where starting price was <$1 with current price >$100
  • Early ETF history before AUM exceeded $1B

  Action: EXCLUDE those years from the base calculation.
  Flag as: "DISCOVERY_PHASE_EXCLUDED — years [X] to [Y] removed"

── 2C. IRREPETIBLE GROWTH PHASE ──
  Check if the asset experienced a structural growth phase
  that CANNOT repeat — because it was a phase of going from
  small/unknown to dominant/established.

  Indicators:
  • Company grew from <$10B to >$500B market cap during the period
  • CAGR during that phase was >40% sustained for 5+ years
  • The business model is now mature and dominant (no longer a challenger)

  Examples: Amazon 1997-2010, Apple 2003-2012, Netflix 2010-2018

  Action: Weight recent 10-year CAGR more heavily than full history.
  Flag as: "MATURITY_ADJUSTMENT — early hypergrowth phase discounted"

── 2D. RECENT ANOMALOUS SPIKE ──
  Check if the asset has had an exceptional price spike in the
  last 1–3 years that is event-driven and likely already
  prices in future expectations.

  Indicators:
  • Price increase >80% in the last 24 months
  • Driven by a specific theme: AI adoption wave, commodity supercycle,
    regulatory change, pandemic effect, meme/retail frenzy
  • P/E or valuation multiples significantly above 10-year average
  • Analyst consensus already reflects high expectations

  Examples:
  • Nvidia 2023-2024 (AI infrastructure boom)
  • Micron 2024-2025 (HBM/AI memory supercycle)
  • Bitcoin 2020-2021 (institutional adoption wave)
  • Any stock up >150% in 18 months

  Action: REDUCE forward estimates below recent historical CAGR.
  The spike has already "borrowed" returns from the future.
  Flag as: "SPIKE_CORRECTION — recent [X]% move partially priced in"

── 2E. CYCLICAL SECTOR ASSESSMENT ──
  For cyclical assets (semiconductors, energy, shipping, materials):
  Identify where in the cycle the asset currently sits.

  • If near cycle PEAK  → pessimistic scenario weighted more heavily
  • If near cycle BOTTOM → optimistic scenario more plausible
  • Always widen the spread between pessimistic and optimistic

  Flag as: "CYCLICAL_ASSET — cycle position: [PEAK/MID/BOTTOM/UNKNOWN]"

── 2F. MEAN REVERSION PRINCIPLE ──
  All assets tend to revert toward their long-term mean over
  20-30 year horizons. Apply this universally:

  • If recent 5Y CAGR >> 20Y CAGR → forward estimate should be
    closer to 20Y CAGR, not recent 5Y
  • If current P/E or valuation is significantly above historical
    average → apply a 1-3% annual drag to forward estimates
  • Exception: structural shifts (new business model, new market)
    can justify sustained deviation — but must be explicitly argued

═══════════════════════════════════════════════════════════
SECTION 3 — RETURN ESTIMATION LOGIC
═══════════════════════════════════════════════════════════

After applying all filters above, estimate three scenarios.
These are ANNUALIZED FORWARD-LOOKING CAGR estimates for a
10-30 year investment horizon using dollar-cost averaging.

They are NOT:
  ✗ The best year the asset ever had
  ✗ The worst year the asset ever had
  ✗ A short-term price target
  ✗ A guarantee of any kind

They ARE:
  ✓ A realistic annualized average across the full period
  ✓ The kind of number a disciplined long-term investor
    might reasonably expect in each scenario
  ✓ Anchored to fundamental logic, not just past data

── PESSIMISTIC SCENARIO ──
  "Everything goes wrong, but it's not total collapse"
  • Macro: persistent inflation, stagnation, rising rates
  • Asset-specific: increased competition, regulation,
    sector headwinds, loss of market share
  • For crypto: regulatory crackdown, slow adoption
  • For tech: antitrust breakups, AI commoditization
  • Result: low but not necessarily negative annualized return
    (unless asset has genuine risk of going to zero)

── BASE SCENARIO ──
  "Things proceed roughly as historically expected"
  • Uses long-term historical CAGR (after distortion filters)
  • Adjusted for current valuation vs historical average
  • Mean reversion applied
  • This is the most likely scenario — weight it as such

── OPTIMISTIC SCENARIO ──
  "Things go well, but remain within the realm of plausibility"
  • Strong macro tailwinds, sector leadership maintained
  • For crypto: significant institutional/sovereign adoption
  • For tech: continued AI/productivity revolution
  • HARD CAP: no asset should exceed 35% annualized
    in the optimistic scenario for a 20+ year horizon.
    A 35% annualized return over 20 years turns
    CHF 500/month into ~CHF 2 billion. That is the ceiling
    of what is still "imaginable". Anything above is fantasy.

── REFERENCE RANGES BY CATEGORY ──
  Use these as anchors. Adjust based on specific asset analysis.

  GLOBAL_ETF:       pess 3–4%   base 6–8%    opt 9–11%
  SP500_ETF:        pess 4–5%   base 8–10%   opt 12–14%
  NASDAQ_ETF:       pess 5–7%   base 11–14%  opt 16–19%
  SECTOR_ETF:       pess 2–5%   base 8–12%   opt 14–18%
  BOND_ETF:         pess 1–2%   base 3–5%    opt 5–7%
  DIVIDEND_ETF:     pess 4–5%   base 7–9%    opt 10–12%
  MEGA_CAP_STABLE:  pess 5–7%   base 9–12%   opt 13–16%
  MEGA_CAP_GROWTH:  pess 6–8%   base 12–16%  opt 18–24%
  LARGE_CAP_STABLE: pess 4–6%   base 8–11%   opt 13–16%
  LARGE_CAP_GROWTH: pess 5–8%   base 11–15%  opt 17–22%
  MID_SMALL_CAP:    pess 2–5%   base 9–13%   opt 16–22%
  CYCLICAL_SECTOR:  pess 0–4%   base 8–12%   opt 15–22%
  SPECULATIVE_GROWTH: pess -5–2% base 8–14%  opt 18–28%
  CRYPTO_MAJOR:     pess 0–5%   base 12–18%  opt 22–30%
  CRYPTO_ALT:       pess -10–0% base 5–15%   opt 20–35%
  COMMODITY_ETF:    pess 1–3%   base 4–6%    opt 7–10%
  REAL_ESTATE:      pess 3–5%   base 6–9%    opt 10–13%

═══════════════════════════════════════════════════════════
SECTION 4 — CONFIDENCE & FLAGS
═══════════════════════════════════════════════════════════

Assign a confidence level to your estimate:

  HIGH       → >15 years clean history, stable asset class,
               no major distortions detected
  MEDIUM     → 8–15 years, or some distortions corrected
  LOW        → <8 years, major distortions, highly speculative,
               or structurally novel asset with no real precedent

Also list all flags triggered from Section 2:
  INSUFFICIENT_HISTORY | LIMITED_HISTORY | DISCOVERY_PHASE_EXCLUDED |
  MATURITY_ADJUSTMENT | SPIKE_CORRECTION | CYCLICAL_ASSET |
  MEAN_REVERSION_APPLIED | VALUATION_DRAG_APPLIED

═══════════════════════════════════════════════════════════
SECTION 5 — USER-FACING EXPLANATION
═══════════════════════════════════════════════════════════

Write a short explanation (3-5 sentences) in plain language
that the user will see in the app. It must:
  • Explain what methodology was used
  • Mention any major adjustments made (spike correction,
    phase exclusion, etc.) in simple terms
  • Be honest about uncertainty
  • NOT use jargon like "CAGR", "standard deviation",
    "mean reversion" — use plain language
  • Language: respond in the same language as the user's query

Example for Micron:
  "Micron has had an exceptional run recently, driven by
  surging demand for AI memory chips. We've adjusted our
  estimates downward from the recent historical pace, because
  part of that growth has already been priced in by the market.
  The base scenario reflects what Micron might deliver over
  20 years as the AI infrastructure cycle matures and
  normalizes. As a cyclical semiconductor company, the range
  between pessimistic and optimistic is intentionally wide."

═══════════════════════════════════════════════════════════
SECTION 6 — OUTPUT FORMAT
═══════════════════════════════════════════════════════════

Return ONLY a valid JSON object. No markdown, no backticks,
no preamble. Exactly this structure:

{
  "symbol": "TICKER",
  "name": "Full asset name",
  "category": "CATEGORY_FROM_SECTION_1",
  "currentPrice": 123.45,
  "currency": "USD",
  "risk": "Low | Medium | High | Very High",
  "sector": "Technology | Finance | Energy | Crypto | etc.",
  "returns": {
    "pessimistic": 5.0,
    "base": 12.0,
    "optimistic": 20.0
  },
  "confidence": "HIGH | MEDIUM | LOW",
  "flags": ["FLAG_1", "FLAG_2"],
  "adjustments": {
    "historyYearsUsed": 12,
    "historyYearsExcluded": 3,
    "exclusionReason": "Discovery phase pre-2017 excluded",
    "spikeDetected": true,
    "spikeDescription": "180% move in 24 months (AI memory cycle)",
    "cyclePosition": "PEAK | MID | BOTTOM | N/A",
    "valuationVsHistorical": "ELEVATED | NORMAL | DEPRESSED | N/A"
  },
  "explanation": "Plain language explanation for the user (3-5 sentences)",
  "disclaimer": "Estimates are based on historical analysis and forward-looking assumptions. They do not guarantee future results and do not constitute financial advice."
}

For unrecognized or not-found assets: set symbol: "NOT_FOUND".`;

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
  const category = row.category ?? 'SPECULATIVE_GROWTH';
  const fallback  = RETURN_BENCHMARKS[category] ?? RETURN_BENCHMARKS.SPECULATIVE_GROWTH;
  const returns = {
    pessimistic: row.return_pessimistic ?? fallback.pessimistic,
    base:        row.return_base        ?? fallback.base,
    optimistic:  row.return_optimistic  ?? fallback.optimistic,
  };
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

  let query, refresh;
  try {
    ({ query, refresh } = await request.json());
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

  const forceRefresh = refresh === true || refresh === 'true';

  const supabase = getSupabase();
  const now = Date.now();
  const q = query.trim();

  // --- Look up existing DB record ---
  let cached = null;

  // 1. search_terms array contains the query (most reliable)
  const { data: termMatch } = await supabase
    .from('stocks')
    .select('*')
    .contains('search_terms', [q.toLowerCase()])
    .not('name', 'is', null)
    .limit(1)
    .maybeSingle();
  cached = termMatch ?? null;

  // 2. Exact symbol match (for rows predating search_terms)
  if (!cached) {
    const { data: exactMatch } = await supabase
      .from('stocks')
      .select('*')
      .eq('symbol', q.toUpperCase())
      .not('name', 'is', null)
      .maybeSingle();
    cached = exactMatch ?? null;
  }

  // 3. Name ILIKE fallback
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

  // ── Layer 1: AI data (TTL 30 days) ──────────────────────────────────────────
  const aiAge   = cached?.ai_updated_at ? now - new Date(cached.ai_updated_at).getTime() : Infinity;
  const aiStale = forceRefresh || aiAge > TTL_AI;

  if (!aiStale) {
    console.log(`[search] AI cache HIT: ${row.symbol} (age ${Math.round(aiAge / 86400000)}d)`);
    // Add current query to search_terms if not already present
    if (!cached.search_terms?.includes(q.toLowerCase())) {
      const updated = [...new Set([...(cached.search_terms ?? []), q.toLowerCase()])];
      supabase.from('stocks').update({ search_terms: updated }).eq('symbol', cached.symbol).then(({ error }) => {
        if (error) console.log(`[search] search_terms update error:`, error.message);
        else console.log(`[search] search_terms updated for ${cached.symbol}: added "${q.toLowerCase()}"`);
      });
    }
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

    const fallback     = RETURN_BENCHMARKS[aiResult.category] ?? RETURN_BENCHMARKS.SPECULATIVE_GROWTH;
    const aiReturns    = aiResult.returns ?? {};

    // New prompt doesn't include yahoo_symbol — derive it from symbol + category
    const deriveYahooSymbol = (sym, cat) => {
      if (!sym) return null;
      if ((cat === 'CRYPTO_MAJOR' || cat === 'CRYPTO_ALT') && !sym.includes('-')) return `${sym}-USD`;
      return sym;
    };
    const yahooSymbol = aiResult.yahoo_symbol ?? deriveYahooSymbol(aiResult.symbol, aiResult.category);

    // Derive type from category when not provided
    const deriveType = (cat) => {
      if (!cat) return null;
      if (cat.includes('ETF') || cat === 'REAL_ESTATE' || cat === 'COMMODITY_ETF') return 'ETF';
      if (cat === 'CRYPTO_MAJOR' || cat === 'CRYPTO_ALT') return 'Crypto';
      return 'Stock';
    };

    const searchTerms  = [
      aiResult.symbol.toLowerCase(),
      yahooSymbol?.toLowerCase(),
      ...aiResult.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
      q.toLowerCase(),
    ].filter(Boolean);
    // Preserve any extra terms already in DB (e.g. from previous searches)
    const existingTerms = cached?.search_terms ?? [];
    const aiFields  = {
      symbol:             aiResult.symbol,
      yahoo_symbol:       yahooSymbol,
      name:               aiResult.name,
      type:               aiResult.type ?? deriveType(aiResult.category),
      category:           aiResult.category,
      risk:               aiResult.risk,
      sector:             aiResult.sector,
      description:        aiResult.description ?? null,
      // explanation stores: text + confidence + flags + adjustments
      explanation: {
        text:        aiResult.explanation ?? null,
        confidence:  aiResult.confidence  ?? null,
        flags:       aiResult.flags       ?? [],
        adjustments: aiResult.adjustments ?? {},
      },
      return_pessimistic: aiReturns.pessimistic ?? fallback.pessimistic,
      return_base:        aiReturns.base        ?? fallback.base,
      return_optimistic:  aiReturns.optimistic  ?? fallback.optimistic,
      search_terms:       [...new Set([...existingTerms, ...searchTerms])],
      ai_updated_at:      new Date().toISOString(),
    };

    const { error: aiUpsertErr } = await supabase.from('stocks').upsert(aiFields, { onConflict: 'symbol' });
    if (aiUpsertErr) console.log(`[search] AI upsert ERROR for ${aiFields.symbol}:`, aiUpsertErr.message);
    else console.log(`[search] AI upserted: ${aiFields.symbol} (yahoo: ${aiFields.yahoo_symbol}, ai_updated_at: ${aiFields.ai_updated_at})`);

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
        price_updated_at: new Date().toISOString(),
      };
      const { error: priceUpsertErr } = await supabase.from('stocks').upsert(priceFields, { onConflict: 'symbol' });
      if (priceUpsertErr) console.log(`[search] Price upsert ERROR for ${row.symbol}:`, priceUpsertErr.message);
      else console.log(`[search] Price upserted: ${row.symbol} @ ${priceInfo.price} ${priceInfo.currency} (price_updated_at: ${priceFields.price_updated_at})`);
      row = { ...row, ...priceFields };
    } else {
      console.log(`[search] Yahoo price fetch failed for ${yahooSym}`);
    }
  }

  return new Response(JSON.stringify(buildResponse(row)), {
    headers: { 'Content-Type': 'application/json' },
  });
}
