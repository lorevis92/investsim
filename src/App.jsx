import { useState, useCallback, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line
} from "recharts";

// ─── FONTS ────────────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap";
document.head.appendChild(fontLink);

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg: "#080C14",
  surface: "#0D1420",
  border: "#1A2540",
  accent: "#00E5FF",
  accent2: "#FF6B35",
  accent3: "#7C3AED",
  text: "#E8F0FF",
  muted: "#4A5980",
  success: "#00D68F",
  danger: "#FF4757",
};

const PALETTE = [
  "#00E5FF", "#FF6B35", "#7C3AED", "#00D68F", "#FFB800",
  "#FF4757", "#2196F3", "#E040FB", "#00BCD4", "#FF9800"
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmtK = (v) => {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
};
const fmtCHF = (v) =>
  new Intl.NumberFormat("it-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(v);

const calcDCA = (monthly, annualRate, years) => {
  const mr = annualRate / 12;
  const n = years * 12;
  const fv = monthly * ((Math.pow(1 + mr, n) - 1) / mr) * (1 + mr);
  return fv;
};

const buildChartData = (holdings, years = 30) =>
  Array.from({ length: years + 1 }, (_, y) => {
    const row = { year: y, invested: holdings.reduce((s, h) => s + h.monthly * 12 * y, 0) };
    holdings.forEach((h) => {
      row[h.symbol] = Math.round(calcDCA(h.monthly, h.rate / 100, y));
    });
    row.total = holdings.reduce((s, h) => s + (row[h.symbol] || 0), 0);
    return row;
  });

const MILESTONES = [10, 15, 20, 25, 30];

// ─── AI FETCH ─────────────────────────────────────────────────────────────────
async function fetchStockInfo(query) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `Sei un assistente finanziario esperto. L'utente cerca informazioni su un titolo azionario, ETF o indice per simulare un investimento DCA a lungo termine.
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
Per titoli/ETF famosi usa dati reali. Per richieste vaghe o non trovate, metti estimatedAnnualReturn: null e symbol: "NOT_FOUND".`,
      messages: [{ role: "user", content: `Cerca: ${query}` }],
    }),
  });
  const data = await res.json();
  const text = data.content?.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

const css = (styles) => Object.entries(styles).map(([k, v]) => `${k.replace(/([A-Z])/g, "-$1").toLowerCase()}:${v}`).join(";");

function Tag({ children, color = T.accent }) {
  return (
    <span style={{
      fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1,
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontWeight: 500,
    }}>{children}</span>
  );
}

function RiskBadge({ risk }) {
  const map = { Low: T.success, Medium: "#FFB800", High: T.accent2, "Very High": T.danger };
  return <Tag color={map[risk] || T.muted}>{risk}</Tag>;
}

function SearchPanel({ onAdd, onExplore }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [monthly, setMonthly] = useState(500);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const data = await fetchStockInfo(query);
      if (data.symbol === "NOT_FOUND" || !data.estimatedAnnualReturn) {
        setError("Titolo non trovato o dati insufficienti. Prova con un ticker (es. AAPL, QQQ, MSFT).");
      } else {
        setResult(data);
      }
    } catch {
      setError("Errore nella ricerca. Riprova.");
    }
    setLoading(false);
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, letterSpacing: 3, color: T.muted, marginBottom: 16, textTransform: "uppercase" }}>
        🔍 Cerca titolo
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Es: Nvidia, QQQ, S&P500, Apple..."
          style={{
            flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
            color: T.text, fontFamily: "'DM Mono', monospace", fontSize: 13,
            padding: "12px 16px", outline: "none",
          }}
        />
        <button
          onClick={search}
          disabled={loading}
          style={{
            background: loading ? T.muted : T.accent, color: T.bg,
            border: "none", borderRadius: 10, padding: "12px 20px",
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
            cursor: loading ? "default" : "pointer", transition: "all .2s",
          }}
        >
          {loading ? "..." : "Cerca"}
        </button>
      </div>

      {error && (
        <div style={{ color: T.danger, fontSize: 12, fontFamily: "'DM Mono', monospace", padding: "8px 12px", background: T.danger + "11", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ background: T.bg, borderRadius: 12, padding: 20, border: `1px solid ${T.accent}33` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: T.accent }}>{result.symbol}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: T.muted, marginLeft: 10 }}>{result.name}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Tag>{result.type}</Tag>
              <RiskBadge risk={result.risk} />
            </div>
          </div>

          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
            {result.description}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{ background: T.surface, borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 10, color: T.muted, fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>RENDIMENTO STIMATO/ANNO</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: T.success }}>
                {result.estimatedAnnualReturn}%
              </div>
              <div style={{ fontSize: 10, color: T.muted, fontFamily: "'DM Mono', monospace", marginTop: 4, lineHeight: 1.4 }}>
                {result.returnBasis}
              </div>
            </div>
            <div style={{ background: T.surface, borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 10, color: T.muted, fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>SETTORE</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: T.text }}>{result.sector}</div>
              {result.currentPrice && (
                <div style={{ fontSize: 12, color: T.muted, fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
                  ~{result.currency} {result.currentPrice}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: T.muted, fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
              INVESTIMENTO MENSILE (CHF)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range" min={50} max={5000} step={50} value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value))}
                style={{ flex: 1, accentColor: T.accent }}
              />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 500, color: T.accent, minWidth: 80, textAlign: "right" }}>
                CHF {monthly.toLocaleString("it-CH")}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onAdd({ ...result, monthly, color: PALETTE[Math.floor(Math.random() * PALETTE.length)], rate: result.estimatedAnnualReturn })}
              style={{
                flex: 1, background: T.accent, color: T.bg, border: "none", borderRadius: 10,
                padding: "12px 0", fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              + Aggiungi al portafoglio
            </button>
            <button
              onClick={() => onExplore(result)}
              style={{
                flex: 1, background: "transparent", color: T.accent, border: `1px solid ${T.accent}44`,
                borderRadius: 10, padding: "12px 0", fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              📊 Solo esplora
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExplorePanel({ stock, onClose }) {
  const data = buildChartData([{ ...stock, monthly: 1000, color: T.accent }], 30);
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: T.accent }}>{stock.symbol}</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: T.muted, marginLeft: 10 }}>{stock.estimatedAnnualReturn}% annuo stimato</span>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>
      <div style={{ fontSize: 10, color: T.muted, fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>Simulazione con CHF 1.000/mese</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.accent} stopOpacity={0.3} />
              <stop offset="95%" stopColor={T.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="year" stroke={T.muted} tick={{ fontSize: 10, fontFamily: "'DM Mono', monospace" }} tickFormatter={(v) => `${v}a`} />
          <YAxis stroke={T.muted} tick={{ fontSize: 10, fontFamily: "'DM Mono', monospace" }} tickFormatter={(v) => fmtK(v)} />
          <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 11 }}
            formatter={(v) => [fmtCHF(v)]} labelFormatter={(l) => `Anno ${l}`} />
          <Area type="monotone" dataKey={stock.symbol} stroke={T.accent} fill="url(#eg)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="invested" stroke={T.muted} fill="transparent" strokeDasharray="4 2" strokeWidth={1} dot={false} name="Versato" />
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginTop: 16 }}>
        {MILESTONES.map((y) => {
          const fv = calcDCA(1000, stock.estimatedAnnualReturn / 100, y);
          const inv = 1000 * 12 * y;
          return (
            <div key={y} style={{ background: T.bg, borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.muted, fontFamily: "'DM Mono', monospace" }}>{y} anni</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, fontFamily: "'Syne', sans-serif", marginTop: 4 }}>{fmtK(fv)}</div>
              <div style={{ fontSize: 9, color: T.success, fontFamily: "'DM Mono', monospace" }}>x{(fv / inv).toFixed(1)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortfolioCard({ portfolio, onSelect, onDelete, selected }) {
  const total = portfolio.holdings.reduce((s, h) => s + h.monthly, 0);
  const chartData = buildChartData(portfolio.holdings);
  return (
    <div
      onClick={() => onSelect(portfolio.id)}
      style={{
        background: selected ? T.accent + "11" : T.surface,
        border: `1px solid ${selected ? T.accent + "66" : T.border}`,
        borderRadius: 12, padding: 16, cursor: "pointer",
        transition: "all .2s", position: "relative",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(portfolio.id); }}
        style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 14 }}
      >✕</button>
      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 4 }}>
        {portfolio.name}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: T.muted, marginBottom: 12 }}>
        CHF {total.toLocaleString()} /mese · {portfolio.holdings.length} titoli
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {portfolio.holdings.map((h) => (
          <span key={h.symbol} style={{ fontSize: 10, background: h.color + "22", color: h.color, border: `1px solid ${h.color}44`, borderRadius: 4, padding: "2px 6px", fontFamily: "'DM Mono', monospace" }}>
            {h.symbol}
          </span>
        ))}
      </div>
    </div>
  );
}

function PortfolioEditor({ portfolio, onChange }) {
  const [mode, setMode] = useState("amount"); // "amount" | "percent"
  const totalMonthly = portfolio.holdings.reduce((s, h) => s + h.monthly, 0);

  const updateHolding = (symbol, field, val) => {
    onChange({
      ...portfolio,
      holdings: portfolio.holdings.map((h) =>
        h.symbol === symbol ? { ...h, [field]: val } : h
      ),
    });
  };

  const removeHolding = (symbol) => {
    onChange({ ...portfolio, holdings: portfolio.holdings.filter((h) => h.symbol !== symbol) });
  };

  const setFromPercent = (totalMonthlyCHF) => {
    onChange({
      ...portfolio,
      holdings: portfolio.holdings.map((h) => ({
        ...h,
        monthly: Math.round((h._pct / 100) * totalMonthlyCHF),
      })),
    });
  };

  const initPercent = () => {
    const total = portfolio.holdings.reduce((s, h) => s + h.monthly, 0) || 1;
    onChange({
      ...portfolio,
      holdings: portfolio.holdings.map((h) => ({
        ...h,
        _pct: Math.round((h.monthly / total) * 100),
      })),
    });
  };

  const chartData = buildChartData(portfolio.holdings);

  return (
    <div>
      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <input
          value={portfolio.name}
          onChange={(e) => onChange({ ...portfolio, name: e.target.value })}
          style={{
            background: "transparent", border: "none", borderBottom: `2px solid ${T.accent}`,
            color: T.text, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22,
            padding: "4px 0", outline: "none", width: "auto", minWidth: 200,
          }}
        />
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: T.muted }}>
          CHF {totalMonthly.toLocaleString()} /mese totale
        </span>
      </div>

      {/* Mode toggle */}
      {portfolio.holdings.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["amount", "percent"].map((m) => (
            <button
              key={m}
              onClick={() => { if (m === "percent") initPercent(); setMode(m); }}
              style={{
                background: mode === m ? T.accent : "transparent",
                color: mode === m ? T.bg : T.muted,
                border: `1px solid ${mode === m ? T.accent : T.border}`,
                borderRadius: 8, padding: "6px 14px",
                fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer",
              }}
            >
              {m === "amount" ? "Per importo" : "Per percentuale"}
            </button>
          ))}
        </div>
      )}

      {/* Holdings */}
      {portfolio.holdings.length === 0 ? (
        <div style={{ textAlign: "center", color: T.muted, fontFamily: "'DM Mono', monospace", fontSize: 13, padding: 40 }}>
          Nessun titolo nel portafoglio. Usa la ricerca per aggiungerne.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {portfolio.holdings.map((h) => (
            <div key={h.symbol} style={{ background: T.bg, borderRadius: 10, padding: 16, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 4, height: 40, borderRadius: 2, background: h.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: h.color, fontSize: 15 }}>{h.symbol}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: T.muted }}>{h.name?.substring(0, 30)}</span>
                  <Tag color={T.success}>{h.rate}%/a</Tag>
                </div>
                {mode === "amount" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <input
                      type="range" min={0} max={5000} step={50} value={h.monthly}
                      onChange={(e) => updateHolding(h.symbol, "monthly", Number(e.target.value))}
                      style={{ flex: 1, accentColor: h.color }}
                    />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: h.color, minWidth: 80, textAlign: "right" }}>
                      CHF {h.monthly.toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <input
                      type="range" min={0} max={100} step={1} value={h._pct || 0}
                      onChange={(e) => {
                        const newPct = Number(e.target.value);
                        const updated = { ...portfolio, holdings: portfolio.holdings.map((hh) => hh.symbol === h.symbol ? { ...hh, _pct: newPct } : hh) };
                        const totalPct = updated.holdings.reduce((s, hh) => s + (hh._pct || 0), 0);
                        onChange({ ...updated, _totalPct: totalPct });
                      }}
                      style={{ flex: 1, accentColor: h.color }}
                    />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: h.color, minWidth: 44, textAlign: "right" }}>
                      {h._pct || 0}%
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => removeHolding(h.symbol)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          ))}

          {mode === "percent" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.muted, fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                  Totale mensile (CHF) da distribuire
                </div>
                <input
                  type="range" min={100} max={10000} step={100}
                  defaultValue={totalMonthly || 1000}
                  onChange={(e) => setFromPercent(Number(e.target.value))}
                  style={{ width: "100%", accentColor: T.accent }}
                />
              </div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: T.accent, minWidth: 80, textAlign: "right" }}>
                CHF {totalMonthly.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      {portfolio.holdings.length > 0 && (
        <>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.muted, marginBottom: 8, letterSpacing: 2, textTransform: "uppercase" }}>
            Proiezione portafoglio
          </div>
          <div style={{ background: T.bg, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  {portfolio.holdings.map((h) => (
                    <linearGradient key={h.symbol} id={`g-${h.symbol}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={h.color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={h.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="year" stroke={T.muted} tick={{ fontSize: 10, fontFamily: "'DM Mono', monospace" }} tickFormatter={(v) => `${v}a`} />
                <YAxis stroke={T.muted} tick={{ fontSize: 10, fontFamily: "'DM Mono', monospace" }} tickFormatter={fmtK} />
                <Tooltip
                  contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 11 }}
                  formatter={(v, name) => [fmtCHF(v), name]}
                  labelFormatter={(l) => `Anno ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'DM Mono', monospace" }} />
                <Area type="monotone" dataKey="invested" name="Versato" stroke={T.muted} fill="transparent" strokeDasharray="4 2" strokeWidth={1.5} dot={false} />
                {portfolio.holdings.map((h) => (
                  <Area key={h.symbol} type="monotone" dataKey={h.symbol} stroke={h.color} fill={`url(#g-${h.symbol})`} strokeWidth={2} dot={false} />
                ))}
                <Area type="monotone" dataKey="total" name="TOTALE" stroke="#ffffff" fill="transparent" strokeWidth={2.5} dot={false} strokeDasharray="0" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Milestone table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: T.muted, fontWeight: 400 }}>Titolo</th>
                  {MILESTONES.map((y) => <th key={y} style={{ textAlign: "right", padding: "8px 12px", color: T.muted, fontWeight: 400 }}>{y}a</th>)}
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((h) => (
                  <tr key={h.symbol} style={{ borderBottom: `1px solid ${T.border}22` }}>
                    <td style={{ padding: "10px 12px", color: h.color, fontWeight: 500 }}>{h.symbol}</td>
                    {MILESTONES.map((y) => (
                      <td key={y} style={{ textAlign: "right", padding: "10px 12px", color: T.text }}>
                        {fmtCHF(calcDCA(h.monthly, h.rate / 100, y))}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: "10px 12px", color: T.accent, fontWeight: 700 }}>TOTALE</td>
                  {MILESTONES.map((y) => (
                    <td key={y} style={{ textAlign: "right", padding: "10px 12px", color: T.accent, fontWeight: 700 }}>
                      {fmtCHF(portfolio.holdings.reduce((s, h) => s + calcDCA(h.monthly, h.rate / 100, y), 0))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: "6px 12px", color: T.muted, fontSize: 10 }}>versato</td>
                  {MILESTONES.map((y) => {
                    const inv = totalMonthly * 12 * y;
                    const tot = portfolio.holdings.reduce((s, h) => s + calcDCA(h.monthly, h.rate / 100, y), 0);
                    return (
                      <td key={y} style={{ textAlign: "right", padding: "6px 12px", color: T.success, fontSize: 10 }}>
                        {fmtCHF(inv)} · x{(tot / (inv || 1)).toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
let _id = 1;
const makePortfolio = () => ({ id: _id++, name: `Portafoglio ${_id - 1}`, holdings: [] });

export default function App() {
  const [portfolios, setPortfolios] = useState([makePortfolio()]);
  const [selectedPf, setSelectedPf] = useState(1);
  const [exploreStock, setExploreStock] = useState(null);
  const [tab, setTab] = useState("portfolio");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentPf = portfolios.find((p) => p.id === selectedPf);

  const addHolding = (stock) => {
    setPortfolios((pfs) =>
      pfs.map((p) =>
        p.id === selectedPf
          ? {
              ...p,
              holdings: p.holdings.find((h) => h.symbol === stock.symbol)
                ? p.holdings.map((h) => h.symbol === stock.symbol ? { ...h, monthly: h.monthly + stock.monthly } : h)
                : [...p.holdings, stock],
            }
          : p
      )
    );
    setTab("portfolio");
    setSidebarOpen(false);
  };

  const updatePf = (updated) => {
    setPortfolios((pfs) => pfs.map((p) => (p.id === updated.id ? updated : p)));
  };

  const addPortfolio = () => {
    const pf = makePortfolio();
    setPortfolios((p) => [...p, pf]);
    setSelectedPf(pf.id);
  };

  const deletePf = (id) => {
    const remaining = portfolios.filter((p) => p.id !== id);
    setPortfolios(remaining.length ? remaining : [makePortfolio()]);
    setSelectedPf(remaining[0]?.id || 1);
  };

  const selectPf = (id) => {
    setSelectedPf(id);
    setSidebarOpen(false);
    setTab("portfolio");
  };

  const pfName = currentPf?.name || "Portafoglio";

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "'Syne', sans-serif", position: "relative" }}>

      {/* Overlay when sidebar open on mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 40, backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* Sidebar drawer */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 280,
        background: T.surface, borderRight: `1px solid ${T.border}`,
        zIndex: 50, padding: 16, display: "flex", flexDirection: "column", gap: 8,
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .25s cubic-bezier(.4,0,.2,1)",
        overflowY: "auto",
      }}>
        {/* Sidebar header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: T.muted, fontFamily: "'DM Mono', monospace", letterSpacing: 2, textTransform: "uppercase" }}>
            I tuoi portafogli
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}
          >✕</button>
        </div>

        {portfolios.map((p) => (
          <PortfolioCard
            key={p.id} portfolio={p}
            selected={p.id === selectedPf}
            onSelect={selectPf}
            onDelete={deletePf}
          />
        ))}
        <button
          onClick={addPortfolio}
          style={{
            background: "transparent", border: `1px dashed ${T.border}`, borderRadius: 12,
            color: T.muted, padding: "12px 0", fontFamily: "'DM Mono', monospace", fontSize: 12,
            cursor: "pointer", marginTop: 4,
          }}
        >
          + Nuovo portafoglio
        </button>
      </div>

      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${T.border}`, padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, background: T.bg, zIndex: 30,
      }}>
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
            color: T.text, cursor: "pointer", padding: "7px 10px", fontSize: 16, lineHeight: 1,
            flexShrink: 0,
          }}
        >☰</button>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, color: T.accent }}>INVEST</span>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, color: T.text }}>SIM</span>
          {/* Current portfolio pill */}
          <span style={{
            fontSize: 10, color: T.accent, background: T.accent + "18",
            border: `1px solid ${T.accent}33`, borderRadius: 6,
            padding: "2px 8px", fontFamily: "'DM Mono', monospace",
            letterSpacing: 1, marginLeft: 4,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120,
          }}>
            {pfName}
          </span>
        </div>

        <div style={{ fontSize: 9, color: T.muted, fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
          ⚠️ Solo simulazione
        </div>
      </div>

      {/* Main content — full width */}
      <div style={{ padding: "16px", maxWidth: 800, margin: "0 auto" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["search", "🔍 Cerca"], ["portfolio", "📊 Portafoglio"]].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? T.accent : "transparent",
                color: tab === t ? T.bg : T.muted,
                border: `1px solid ${tab === t ? T.accent : T.border}`,
                borderRadius: 8, padding: "8px 16px",
                fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "search" && (
          <SearchPanel onAdd={addHolding} onExplore={(s) => { setExploreStock(s); setTab("explore"); }} />
        )}

        {tab === "explore" && exploreStock && (
          <ExplorePanel stock={exploreStock} onClose={() => setTab("search")} />
        )}

        {tab === "portfolio" && currentPf && (
          <PortfolioEditor portfolio={currentPf} onChange={updatePf} />
        )}
      </div>
    </div>
  );
}
