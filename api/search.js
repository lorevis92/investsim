import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `Sei un assistente finanziario esperto. L'utente cerca informazioni su un titolo azionario, ETF o indice per simulare un investimento DCA a lungo termine.
Rispondi SOLO con un oggetto JSON valido, nessun testo aggiuntivo, nessun markdown, nessuna backtick.
Il JSON deve avere questa struttura:
{
  "symbol": "TICKER",
  "name": "Nome completo",
  "type": "ETF|Stock|Index",
  "currentPrice": 123.45,
  "currency": "USD",
  "returns": {
    "pessimistic": 5.0,
    "base": 10.0,
    "optimistic": 15.0
  },
  "returnBasis": "Spiegazione della metodologia usata (2-3 frasi)",
  "description": "Descrizione breve del titolo (2-3 frasi)",
  "risk": "Low|Medium|High|Very High",
  "sector": "Technology|Finance|etc",
  "explanation": {
    "historical": "Spiegazione semplice dei dati storici usati — es: Negli ultimi 20 anni questo titolo ha reso in media X% all'anno",
    "currentContext": "Contesto attuale del titolo — valutazione, settore, momento di mercato — in 2-3 frasi semplici",
    "riskFactors": "I principali fattori che potrebbero far andare meglio o peggio rispetto alle aspettative — in 2-3 frasi semplici",
    "methodology": "Come abbiamo costruito i tre scenari pessimistico, base, ottimistico — 1-2 frasi"
  }
}
Per i tre scenari usa benchmark storici di lungo periodo (20-30 anni):
- pessimistic: media storica 20-30 anni meno 1.5 deviazioni standard, o rendimento minimo per asset class
- base: media storica 20-30 anni aggiustata per valutazione attuale e mean reversion
- optimistic: media storica 20-30 anni pura
Per il campo explanation usa un linguaggio semplice e accessibile a chi non investe — niente gergo finanziario, spiega come lo spiegheresti a un amico.
Per titoli/ETF famosi usa dati reali. Per richieste vaghe o non trovate, metti returns: null e symbol: "NOT_FOUND".`;

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
    returns: {
      pessimistic: row.return_pessimistic,
      base: row.return_base,
      optimistic: row.return_optimistic,
    },
    risk: row.risk,
    sector: row.sector,
    description: row.description,
    returnBasis: row.return_basis,
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

  // Cache lookup: match by symbol (uppercase) and freshness
  const { data: cached } = await supabase
    .from('stocks')
    .select('*')
    .eq('symbol', query.trim().toUpperCase())
    .gt('updated_at', cutoff)
    .maybeSingle();

  if (cached) {
    return new Response(JSON.stringify(mapToApiShape(cached)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
      max_tokens: 1800,
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

  // Persist to DB if valid result
  if (result.symbol && result.symbol !== 'NOT_FOUND' && result.returns?.base != null) {
    await supabase.from('stocks').upsert(
      {
        symbol: result.symbol,
        name: result.name,
        type: result.type,
        return_pessimistic: result.returns.pessimistic,
        return_base: result.returns.base,
        return_optimistic: result.returns.optimistic,
        risk: result.risk,
        sector: result.sector,
        description: result.description,
        return_basis: result.returnBasis,
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
