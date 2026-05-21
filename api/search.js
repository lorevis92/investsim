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
  "estimatedAnnualReturn": 15.0,
  "returnBasis": "Breve spiegazione del perché questo rendimento stimato (1-2 frasi)",
  "description": "Descrizione breve del titolo (2-3 frasi)",
  "risk": "Low|Medium|High|Very High",
  "sector": "Technology|Finance|etc"
}
Per estimatedAnnualReturn usa rendimenti storici realistici a lungo termine (10-20+ anni).
Per titoli/ETF famosi usa dati reali. Per richieste vaghe o non trovate, metti estimatedAnnualReturn: null e symbol: "NOT_FOUND".`;

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

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
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

  try {
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Parse error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
