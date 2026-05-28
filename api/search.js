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

const SYSTEM_PROMPT = `IMPORTANT: Always respond in English. All text fields (description, explanation, historical, currentContext, riskFactors, methodology) must be written in English regardless of the language used in the search query.

Sei un assistente finanziario esperto. L'utente cerca informazioni su un titolo azionario, ETF o indice per simulare un investimento DCA a lungo termine.
Rispondi SOLO con un oggetto JSON valido, nessun testo aggiuntivo, nessun markdown, nessuna backtick.
Il JSON deve avere questa struttura:
{
  "symbol": "TICKER",
  "name": "Nome completo",
  "type": "ETF|Stock|Index",
  "category": "etf_global|etf_sp500|etf_nasdaq|large_cap_stable|growth_tech|small_mid_cap|bonds|crypto_etf|speculative",
  "currentPrice": 123.45,
  "currency": "USD",
  "description": "Descrizione breve 2-3 frasi",
  "risk": "Low|Medium|High|Very High",
  "sector": "Technology|Finance|etc",
  "explanation": {
    "historical": "Descrivi in linguaggio semplice la performance storica di questo titolo negli ultimi 20-30 anni — niente gergo finanziario",
    "currentContext": "Contesto attuale del titolo — settore, momento, valutazione — in 2-3 frasi accessibili a chi non investe",
    "riskFactors": "I principali fattori che potrebbero far andare meglio o peggio — in 2-3 frasi semplici",
    "methodology": "Spiega che i rendimenti mostrati sono nominali (quello che si vede sul conto, prima dell'inflazione) e come sono stati costruiti i tre scenari pessimistico, base, ottimistico basati su benchmark storici reali a 20-30 anni"
  }
}
Linee guida per la classificazione della categoria:
- etf_global: ETF su indici mondiali diversificati (MSCI World, All World, VT, VWCE)
- etf_sp500: ETF sull'S&P 500 (SPY, VOO, IVV, CSPX)
- etf_nasdaq: ETF sul Nasdaq (QQQ, QQQM, EQQQ)
- large_cap_stable: Titoli azionari di grandi aziende mature e stabili (Apple, Microsoft, Berkshire, Johnson & Johnson, Nestlé)
- growth_tech: Titoli ad alta crescita o aziende tech aggressive (NVIDIA, Tesla, Amazon, Meta)
- small_mid_cap: Titoli di aziende di piccola-media capitalizzazione
- bonds: Obbligazioni, ETF obbligazionari, titoli di stato
- crypto_etf: ETF su criptovalute o criptovalute dirette (Bitcoin ETF, Ethereum ETF, BTC, ETH)
- speculative: Tutto il resto — asset speculativi, indici settoriali, materie prime, asset non classificabili
Per richieste vaghe o non trovate, metti symbol: "NOT_FOUND" e category: "speculative".`;

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
}

function mapToApiShape(row) {
  return {
    symbol: row.symbol,
    name: row.name,
    type: row.type,
    category: row.category ?? null,
    returns: {
      pessimistic: row.return_pessimistic,
      base: row.return_base,
      optimistic: row.return_optimistic,
    },
    risk: row.risk,
    sector: row.sector,
    description: row.description,
    currentPrice: row.current_price,
    currency: row.currency,
    explanation: row.explanation ?? null,
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
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const q = query.trim();

  // 1. Exact symbol match (e.g. user types "AAPL")
  let { data: cached } = await supabase
    .from('stocks')
    .select('*')
    .eq('symbol', q.toUpperCase())
    .not('name', 'is', null)
    .gt('updated_at', cutoff)
    .maybeSingle();

  // 2. Name ILIKE fallback (e.g. user types "Apple" → matches "Apple Inc.")
  if (!cached) {
    const { data: rows } = await supabase
      .from('stocks')
      .select('*')
      .ilike('name', `%${q}%`)
      .not('name', 'is', null)
      .gt('updated_at', cutoff)
      .limit(1);
    cached = rows?.[0] ?? null;
  }

  if (cached) {
    console.log(`CACHE HIT: ${cached.symbol} — "${cached.name}" (query: "${q}")`);
    return new Response(JSON.stringify(mapToApiShape(cached)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`CACHE MISS for query: "${q}"`);
  // Cache miss — call Claude API
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
      messages: [{ role: 'user', content: `Cerca: ${query}` }],
    }),
  });

  if (!anthropicRes.ok) {
    return new Response(JSON.stringify({ error: 'Upstream API error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await anthropicRes.json();
  const text = data.content?.find((b) => b.type === 'text')?.text || '{}';

  let result;
  try {
    result = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return new Response(JSON.stringify({ error: 'Parse error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Apply fixed benchmarks — numbers always come from the dictionary, never from AI
  result.returns = RETURN_BENCHMARKS[result.category] ?? RETURN_BENCHMARKS.speculative;

  // Persist to DB if valid result
  if (result.symbol && result.symbol !== 'NOT_FOUND' && result.category) {
    await supabase.from('stocks').upsert(
      {
        symbol: result.symbol,
        name: result.name,
        type: result.type,
        category: result.category,
        return_pessimistic: result.returns.pessimistic,
        return_base: result.returns.base,
        return_optimistic: result.returns.optimistic,
        risk: result.risk,
        sector: result.sector,
        description: result.description,
        current_price: result.currentPrice ?? null,
        currency: result.currency ?? null,
        explanation: result.explanation ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'symbol' }
    );
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
}
