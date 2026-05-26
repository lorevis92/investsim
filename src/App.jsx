import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import AuthModal from "./AuthModal";
import { supabase } from "./supabaseClient";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

// Load Syne + DM Mono
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap";
document.head.appendChild(fontLink);

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg:            "#FFFFFF",
  surface:       "#F8F8F8",
  surfaceAlt:    "#F0F0F0",
  border:        "#E8E8E8",
  text:          "#111111",
  textSecondary: "#666666",
  textMuted:     "#AAAAAA",
  primary:       "#E8352A",
  primaryLight:  "rgba(232,53,42,0.06)",
  primaryBorder: "rgba(232,53,42,0.18)",
  green:         "#00996A",
  greenLight:    "rgba(0,153,106,0.06)",
  greenBorder:   "rgba(0,153,106,0.18)",
  red:           "#E8352A",
  redLight:      "rgba(232,53,42,0.06)",
  yellow:        "#B87000",
  yellowLight:   "rgba(184,112,0,0.06)",
  blue:          "#E8352A",
  blueLight:     "rgba(232,53,42,0.06)",
  blueBorder:    "rgba(232,53,42,0.18)",
};

const NUM = { fontFamily: "'DM Mono', monospace" };

const CHART_COLORS = [
  "#E8352A", "#00996A", "#B87000", "#7C4DFF", "#0277BD",
  "#F4511E", "#00897B", "#AB47BC", "#1565C0", "#F9A825",
];

const RISK_LABEL = { Low: "Basso", Medium: "Medio", High: "Alto", "Very High": "Molto alto" };
const RISK_COLOR = {
  Low:         { bg: "rgba(0,153,106,0.07)",  text: "#00996A", border: "rgba(0,153,106,0.20)" },
  Medium:      { bg: "rgba(184,112,0,0.07)",  text: "#B87000", border: "rgba(184,112,0,0.20)" },
  High:        { bg: "rgba(220,100,30,0.07)", text: "#C05A1A", border: "rgba(220,100,30,0.20)" },
  "Very High": { bg: "rgba(232,53,42,0.07)",  text: "#E8352A", border: "rgba(232,53,42,0.20)" },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmtK = (v) => {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
};

const fmtCHF = (v) =>
  new Intl.NumberFormat("it-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(v);

const calcDCA = (monthly, annualRate, years) => {
  const mr = annualRate / 12;
  const n = years * 12;
  return monthly * ((Math.pow(1 + mr, n) - 1) / mr) * (1 + mr);
};

const buildChartData = (holdings, years = 30) =>
  Array.from({ length: years + 1 }, (_, y) => {
    const row = { year: y, invested: holdings.reduce((s, h) => s + h.monthly * 12 * y, 0) };
    holdings.forEach((h) => { row[h.symbol] = Math.round(calcDCA(h.monthly, h.rate / 100, y)); });
    row.total = holdings.reduce((s, h) => s + (row[h.symbol] || 0), 0);
    return row;
  });

const MILESTONES = [10, 15, 20, 25, 30];

// ─── AI FETCH ─────────────────────────────────────────────────────────────────
async function fetchStockInfo(query) {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
function Badge({ children }) {
  return (
    <span style={{
      background: T.surface, color: T.textSecondary, border: `1px solid ${T.border}`,
      fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "2px 8px",
      textTransform: "uppercase", letterSpacing: "0.08em",
      fontFamily: "'Syne', sans-serif",
    }}>{children}</span>
  );
}

function RiskBadge({ risk }) {
  const c = RISK_COLOR[risk] || { bg: T.surface, text: T.textSecondary, border: T.border };
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "2px 8px",
      textTransform: "uppercase", letterSpacing: "0.08em",
      fontFamily: "'Syne', sans-serif",
    }}>RISCHIO {(RISK_LABEL[risk] || risk).toUpperCase()}</span>
  );
}

// ─── EXPLANATION SECTION ──────────────────────────────────────────────────────
function ExplanationSection({ explanation }) {
  const [open, setOpen] = useState(false);
  if (!explanation) return null;

  const items = [
    { icon: "📈", label: "DATI STORICI",      text: explanation.historical },
    { icon: "🔍", label: "CONTESTO ATTUALE",  text: explanation.currentContext },
    { icon: "⚠️", label: "FATTORI DI RISCHIO", text: explanation.riskFactors },
    { icon: "🧮", label: "METODOLOGIA",       text: explanation.methodology },
  ];

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 20 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "14px 0", display: "flex", justifyContent: "space-between",
          alignItems: "center", fontFamily: "'Syne', sans-serif",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, letterSpacing: "0.10em", textTransform: "uppercase" }}>
          Come l'abbiamo calcolato
        </span>
        <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
          {open ? "CHIUDI ▲" : "MOSTRA ▼"}
        </span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16 }}>
          {items.map(({ icon, label, text }) => (
            <div key={label} style={{
              background: T.surface, borderRadius: 4, padding: "12px 14px",
              border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textSecondary, marginBottom: 6, letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>
                {icon} {label}
              </div>
              <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.75 }}>
                {text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SEARCH PANEL ─────────────────────────────────────────────────────────────
function SearchPanel({ onAdd, onExplore }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [monthly, setMonthly] = useState(300);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const data = await fetchStockInfo(query);
      if (data.symbol === "NOT_FOUND" || !data.returns?.base) {
        setError("Titolo non trovato. Prova con un nome diverso — es. Apple, S&P 500, Oro.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Qualcosa è andato storto. Riprova tra qualche secondo.");
    }
    setLoading(false);
  };

  return (
    <div>
      {/* Hero */}
      {!result && (
        <div style={{ textAlign: "center", padding: "64px 8px 44px" }}>
          <h1 style={{
            fontSize: "clamp(32px, 7vw, 60px)", fontWeight: 700,
            color: T.text, margin: "0 0 0", lineHeight: 1.05,
            letterSpacing: "0.10em", textTransform: "uppercase",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}>
            Il tuo futuro
          </h1>
          <h1 style={{
            fontSize: "clamp(32px, 7vw, 60px)", fontWeight: 700,
            color: T.primary, margin: "0 0 24px", lineHeight: 1.05,
            letterSpacing: "0.10em", textTransform: "uppercase",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}>
            finanziario
          </h1>
          <p style={{ fontSize: 15, color: T.textSecondary, margin: "0 0 36px", lineHeight: 1.75, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
            Cerca un titolo, un ETF o un indice — scopri quanto può valere il tuo investimento nel tempo.
          </p>
        </div>
      )}

      {/* Search bar */}
      <div style={{ maxWidth: result ? "100%" : 560, margin: result ? "0 0 20px" : "0 auto 14px" }}>
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          background: T.bg,
          border: `1.5px solid ${result ? T.border : T.primary}`,
          borderRadius: 4, padding: "6px 6px 6px 16px",
          boxShadow: result ? "none" : `0 2px 20px rgba(232,53,42,0.07)`,
        }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Apple, S&P 500, Bitcoin, Oro…"
            style={{
              flex: 1, border: "none", outline: "none",
              fontSize: 15, color: T.text, background: "transparent",
              fontFamily: "'Syne', sans-serif", minWidth: 0,
            }}
          />
          <button
            onClick={search}
            disabled={loading}
            style={{
              background: loading ? T.textMuted : T.primary, color: "#fff",
              border: "none", borderRadius: 3, padding: "10px 22px",
              fontWeight: 700, fontSize: 12, cursor: loading ? "default" : "pointer",
              fontFamily: "'Syne', sans-serif", flexShrink: 0, whiteSpace: "nowrap",
              letterSpacing: "0.09em", textTransform: "uppercase",
            }}
          >
            {loading ? "Cerco…" : "Cerca"}
          </button>
        </div>

        {!result && (
          <p style={{ textAlign: "center", fontSize: 11, color: T.textMuted, marginTop: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Popolari: Apple · S&P 500 · Tesla · Oro · QQQ · Bitcoin
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: T.redLight, border: `1px solid ${T.primaryBorder}`,
          borderRadius: 4, padding: "12px 16px",
          color: T.primary, fontSize: 13, marginBottom: 16,
          fontFamily: "'Syne', sans-serif",
        }}>
          {error}
        </div>
      )}

      {/* Result card */}
      {result && (
        <div style={{
          background: T.bg, border: `1px solid ${T.border}`,
          borderRadius: 6, padding: "24px",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: "0.06em", fontFamily: "Georgia, 'Times New Roman', serif" }}>
                  {result.symbol}
                </span>
                <span style={{ fontSize: 14, color: T.textSecondary }}>{result.name}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <Badge>{result.type}</Badge>
                <RiskBadge risk={result.risk} />
              </div>
            </div>
            {result.currentPrice && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 2, fontFamily: "'Syne', sans-serif" }}>Prezzo indicativo</div>
                <div style={{ fontSize: 17, fontWeight: 600, color: T.text, ...NUM }}>
                  {result.currency} {result.currentPrice}
                </div>
              </div>
            )}
          </div>

          <p style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.75, marginBottom: 22 }}>
            {result.description}
          </p>

          {/* Return scenarios */}
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 4, padding: "16px 18px", marginBottom: 22,
          }}>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 14, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
              Scenari di rendimento annuo — benchmark 20-30 anni
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { key: "pessimistic", label: "Pessimistico", color: "#E8352A", bg: "rgba(232,53,42,0.05)", border: "rgba(232,53,42,0.15)" },
                { key: "base",        label: "Base",         color: "#888888", bg: "rgba(136,136,136,0.04)", border: "rgba(136,136,136,0.12)" },
                { key: "optimistic",  label: "Ottimistico",  color: "#00996A", bg: "rgba(0,153,106,0.05)", border: "rgba(0,153,106,0.15)" },
              ].map(({ key, label, color, bg, border }) => (
                <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "12px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color, fontWeight: 700, marginBottom: 8, letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, ...NUM }}>
                    +{result.returns[key]}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly slider */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>
                Quanto vuoi investire ogni mese?
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: T.primary, flexShrink: 0, marginLeft: 8, ...NUM }}>
                CHF {monthly.toLocaleString("it-CH")}
              </span>
            </div>
            <input
              type="range" min={50} max={3000} step={50} value={monthly}
              onChange={(e) => setMonthly(Number(e.target.value))}
              style={{ width: "100%", accentColor: T.primary }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMuted, marginTop: 6, ...NUM }}>
              <span>CHF 50</span><span>CHF 3.000</span>
            </div>
          </div>

          {/* Quick projections */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 22 }}>
            {[10, 20, 30].map((y) => {
              const fv = calcDCA(monthly, result.returns.base / 100, y);
              const inv = monthly * 12 * y;
              return (
                <div key={y} style={{
                  background: T.surface, borderRadius: 4, padding: "16px 10px",
                  textAlign: "center", border: `1px solid ${T.border}`,
                }}>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 8, letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>
                    {y} anni
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.text, ...NUM }}>{fmtK(fv)}</div>
                  <div style={{ fontSize: 11, color: T.green, marginTop: 6, ...NUM }}>
                    +{Math.round((fv / inv - 1) * 100)}% sul versato
                  </div>
                </div>
              );
            })}
          </div>

          <ExplanationSection explanation={result.explanation} />

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <button
              onClick={() => onAdd({ ...result, monthly, color: CHART_COLORS[Math.floor(Math.random() * CHART_COLORS.length)], rate: result.returns.base })}
              style={{
                flex: 1, minWidth: 140, background: T.primary, color: "#fff",
                border: "none", borderRadius: 3, padding: "14px 16px",
                fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Syne', sans-serif",
                letterSpacing: "0.09em", textTransform: "uppercase",
              }}
            >
              Aggiungi al portafoglio
            </button>
            <button
              onClick={() => onExplore(result)}
              style={{
                flex: 1, minWidth: 140, background: "transparent", color: T.primary,
                border: `1.5px solid ${T.primary}`, borderRadius: 3, padding: "14px 16px",
                fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Syne', sans-serif",
                letterSpacing: "0.09em", textTransform: "uppercase",
              }}
            >
              Vedi simulazione
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SCENARIO_META = [
  { key: "pessimistic", label: "Pessimistico", color: "#E8352A" },
  { key: "base",        label: "Base",         color: "#888888" },
  { key: "optimistic",  label: "Ottimistico",  color: "#00996A" },
];

// ─── EXPLORE PANEL ────────────────────────────────────────────────────────────
function ExplorePanel({ stock, onClose }) {
  const returns = stock.returns ?? { pessimistic: stock.rate, base: stock.rate, optimistic: stock.rate };

  const data = Array.from({ length: 31 }, (_, y) => ({
    year: y,
    invested: 500 * 12 * y,
    pessimistic: Math.round(calcDCA(500, returns.pessimistic / 100, y)),
    base:        Math.round(calcDCA(500, returns.base        / 100, y)),
    optimistic:  Math.round(calcDCA(500, returns.optimistic  / 100, y)),
  }));

  return (
    <div style={{
      background: T.bg, border: `1px solid ${T.border}`,
      borderRadius: 6, padding: "24px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: "0.07em", fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {stock.symbol}
          </span>
          <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 14, letterSpacing: "0.06em", fontFamily: "'Syne', sans-serif" }}>
            CHF 500/mese
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}
        >×</button>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {SCENARIO_META.map(({ key, color }) => (
              <linearGradient key={key} id={`eg-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.12} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="year" stroke={T.border} tick={{ fontSize: 10, fill: T.textMuted, fontFamily: "'DM Mono'" }} tickFormatter={(v) => `${v}a`} />
          <YAxis stroke={T.border} tick={{ fontSize: 10, fill: T.textMuted, fontFamily: "'DM Mono'" }} tickFormatter={fmtK} />
          <Tooltip
            contentStyle={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 12, fontFamily: "'DM Mono'" }}
            formatter={(v, name) => {
              const s = SCENARIO_META.find((m) => m.key === name);
              return [fmtCHF(v), s ? s.label : name === "invested" ? "Versato" : name];
            }}
            labelFormatter={(l) => `Anno ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: T.textSecondary, fontFamily: "'Syne'" }}
            formatter={(v) => {
              const s = SCENARIO_META.find((m) => m.key === v);
              return s ? s.label : "Versato";
            }}
          />
          <Area type="monotone" dataKey="invested" stroke={T.border} fill="transparent" strokeDasharray="5 3" strokeWidth={1.5} dot={false} />
          {SCENARIO_META.map(({ key, color }) => (
            <Area key={key} type="monotone" dataKey={key} stroke={color} fill={`url(#eg-${key})`} strokeWidth={2} dot={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginTop: 18 }}>
        {MILESTONES.map((y) => {
          const inv = 500 * 12 * y;
          return (
            <div key={y} style={{
              background: T.surface, borderRadius: 4, padding: "10px 4px",
              textAlign: "center", border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 6, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>{y} anni</div>
              {SCENARIO_META.map(({ key, color }) => {
                const fv = Math.round(calcDCA(500, returns[key] / 100, y));
                return (
                  <div key={key} style={{ marginBottom: 5 }}>
                    <div style={{ fontSize: 9, color, fontWeight: 700, lineHeight: 1.2, letterSpacing: "0.04em", fontFamily: "'Syne', sans-serif" }}>
                      {key === "pessimistic" ? "Pess." : key === "base" ? "Base" : "Ott."}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, ...NUM }}>{fmtK(fv)}</div>
                    <div style={{ fontSize: 9, color, ...NUM }}>{(fv / inv).toFixed(1)}×</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <ExplanationSection explanation={stock.explanation} />
    </div>
  );
}

// ─── PORTFOLIO CARD ───────────────────────────────────────────────────────────
function PortfolioCard({ portfolio, onSelect, onDelete, selected }) {
  const total = portfolio.holdings.reduce((s, h) => s + h.monthly, 0);
  return (
    <div
      onClick={() => onSelect(portfolio.id)}
      style={{
        background: selected ? T.primaryLight : T.bg,
        border: `1px solid ${selected ? T.primary : T.border}`,
        borderRadius: 4, padding: 14, cursor: "pointer",
        transition: "border-color .15s", position: "relative",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(portfolio.id); }}
        style={{
          position: "absolute", top: 10, right: 10,
          background: "transparent", border: "none",
          color: T.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2,
        }}
      >×</button>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.text, marginBottom: 4, paddingRight: 20, letterSpacing: "0.02em", fontFamily: "'Syne', sans-serif" }}>
        {portfolio.name}
      </div>
      <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8, ...NUM }}>
        CHF {total.toLocaleString("it-CH")} / mese · {portfolio.holdings.length}{" "}
        {portfolio.holdings.length === 1 ? "titolo" : "titoli"}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {portfolio.holdings.map((h) => (
          <span key={h.symbol} style={{
            fontSize: 10, background: T.surface, color: T.textSecondary,
            border: `1px solid ${T.border}`, borderRadius: 3, padding: "2px 6px",
            fontWeight: 700, letterSpacing: "0.06em", fontFamily: "'Syne', sans-serif",
          }}>
            {h.symbol}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── PORTFOLIO EDITOR ─────────────────────────────────────────────────────────
function PortfolioEditor({ portfolio, onChange, onGoToSearch }) {
  const [mode, setMode] = useState("amount");
  const [scenarioMode, setScenarioMode] = useState("base");
  const totalMonthly = portfolio.holdings.reduce((s, h) => s + h.monthly, 0);

  const scenarioRate = (h) => h.returns?.[scenarioMode] ?? h.rate;

  const updateHolding = (symbol, field, val) =>
    onChange({ ...portfolio, holdings: portfolio.holdings.map((h) => h.symbol === symbol ? { ...h, [field]: val } : h) });

  const removeHolding = (symbol) =>
    onChange({ ...portfolio, holdings: portfolio.holdings.filter((h) => h.symbol !== symbol) });

  const initPercent = () => {
    const total = portfolio.holdings.reduce((s, h) => s + h.monthly, 0) || 1;
    onChange({ ...portfolio, holdings: portfolio.holdings.map((h) => ({ ...h, _pct: Math.round((h.monthly / total) * 100) })) });
  };

  const setFromPercent = (totalMonthlyCHF) =>
    onChange({ ...portfolio, holdings: portfolio.holdings.map((h) => ({ ...h, monthly: Math.round((h._pct / 100) * totalMonthlyCHF) })) });

  const chartData = buildChartData(portfolio.holdings.map((h) => ({ ...h, rate: scenarioRate(h) })));

  return (
    <div>
      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
        <input
          value={portfolio.name}
          onChange={(e) => onChange({ ...portfolio, name: e.target.value })}
          style={{
            background: "transparent", border: "none",
            borderBottom: `2px solid ${T.primary}`,
            color: T.text, fontWeight: 700, fontSize: 22,
            padding: "4px 0", outline: "none", fontFamily: "Georgia, 'Times New Roman', serif",
            letterSpacing: "0.04em",
          }}
        />
        {totalMonthly > 0 && (
          <span style={{ fontSize: 13, color: T.textSecondary, ...NUM }}>
            CHF {totalMonthly.toLocaleString("it-CH")} / mese
          </span>
        )}
      </div>

      {/* Mode toggle */}
      {portfolio.holdings.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
          {[["amount", "Importi"], ["percent", "Percentuali"]].map(([m, label]) => (
            <button
              key={m}
              onClick={() => { if (m === "percent") initPercent(); setMode(m); }}
              style={{
                background: mode === m ? T.primary : T.surface,
                color: mode === m ? "#fff" : T.textSecondary,
                border: `1px solid ${mode === m ? T.primary : T.border}`,
                borderRadius: 3, padding: "7px 16px",
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Holdings list */}
      {portfolio.holdings.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "64px 16px",
          background: T.surface, borderRadius: 6,
          border: `1px dashed ${T.border}`,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📈</div>
          <div style={{ fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>
            Nessun titolo ancora
          </div>
          <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 28, lineHeight: 1.7 }}>
            Cerca un titolo e aggiungilo a questo portafoglio.
          </div>
          <button
            onClick={onGoToSearch}
            style={{
              background: T.primary, color: "#fff", border: "none",
              borderRadius: 3, padding: "13px 28px",
              fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Syne', sans-serif",
              letterSpacing: "0.09em", textTransform: "uppercase",
            }}
          >Aggiungi il primo titolo</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {portfolio.holdings.map((h) => (
            <div key={h.symbol} style={{
              background: T.bg, borderRadius: 4,
              padding: "16px 18px", border: `1px solid ${T.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: h.color, letterSpacing: "0.06em", fontFamily: "Georgia, 'Times New Roman', serif" }}>{h.symbol}</span>
                    <span style={{ fontSize: 12, color: T.textSecondary }}>{h.name?.substring(0, 35)}</span>
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap", ...NUM }}>
                    <span style={{ color: "#E8352A" }}>Pess. +{h.returns?.pessimistic ?? h.rate}%</span>
                    <span style={{ color: T.textMuted }}>·</span>
                    <span style={{ color: "#888888" }}>Base +{h.returns?.base ?? h.rate}%</span>
                    <span style={{ color: T.textMuted }}>·</span>
                    <span style={{ color: "#00996A" }}>Ott. +{h.returns?.optimistic ?? h.rate}%</span>
                  </div>
                </div>
                <button
                  onClick={() => removeHolding(h.symbol)}
                  style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}
                >×</button>
              </div>

              {mode === "amount" ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: T.textSecondary, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>Investimento mensile</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text, ...NUM }}>
                      CHF {h.monthly.toLocaleString("it-CH")}
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={5000} step={50} value={h.monthly}
                    onChange={(e) => updateHolding(h.symbol, "monthly", Number(e.target.value))}
                    style={{ width: "100%", accentColor: h.color }}
                  />
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: T.textSecondary, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>Quota del totale</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text, ...NUM }}>{h._pct || 0}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={1} value={h._pct || 0}
                    onChange={(e) => {
                      const newPct = Number(e.target.value);
                      const updated = { ...portfolio, holdings: portfolio.holdings.map((hh) => hh.symbol === h.symbol ? { ...hh, _pct: newPct } : hh) };
                      onChange({ ...updated, _totalPct: updated.holdings.reduce((s, hh) => s + (hh._pct || 0), 0) });
                    }}
                    style={{ width: "100%", accentColor: h.color }}
                  />
                </div>
              )}
            </div>
          ))}

          {mode === "percent" && (
            <div style={{
              background: T.primaryLight, borderRadius: 4,
              padding: "16px 18px", border: `1px solid ${T.primaryBorder}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: T.textSecondary, letterSpacing: "0.09em", textTransform: "uppercase", fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
                  Totale mensile
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.primary, ...NUM }}>
                  CHF {totalMonthly.toLocaleString("it-CH")}
                </span>
              </div>
              <input
                type="range" min={100} max={10000} step={100}
                defaultValue={totalMonthly || 1000}
                onChange={(e) => setFromPercent(Number(e.target.value))}
                style={{ width: "100%", accentColor: T.primary }}
              />
            </div>
          )}
        </div>
      )}

      {/* Chart + table */}
      {portfolio.holdings.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.text, letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>
              Proiezione del portafoglio
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {SCENARIO_META.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setScenarioMode(key)}
                  style={{
                    background: scenarioMode === key ? color : T.surface,
                    color: scenarioMode === key ? (key === "base" ? "#111" : "#fff") : T.textSecondary,
                    border: `1px solid ${scenarioMode === key ? color : T.border}`,
                    borderRadius: 3, padding: "5px 10px",
                    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif",
                    letterSpacing: "0.07em", textTransform: "uppercase",
                  }}
                >{label}</button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 18, lineHeight: 1.5 }}>
            Simulazione basata su rendimenti storici. I risultati passati non garantiscono quelli futuri.
          </p>

          <div style={{
            background: T.surface, borderRadius: 4, padding: 18,
            border: `1px solid ${T.border}`, marginBottom: 22,
          }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  {portfolio.holdings.map((h) => (
                    <linearGradient key={h.symbol} id={`g-${h.symbol}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={h.color} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={h.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="year" stroke={T.border} tick={{ fontSize: 10, fill: T.textMuted, fontFamily: "'DM Mono'" }} tickFormatter={(v) => `${v}a`} />
                <YAxis stroke={T.border} tick={{ fontSize: 10, fill: T.textMuted, fontFamily: "'DM Mono'" }} tickFormatter={fmtK} />
                <Tooltip
                  contentStyle={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 12, fontFamily: "'DM Mono'" }}
                  formatter={(v, name) => [fmtCHF(v), name === "invested" ? "Versato" : name === "total" ? "Totale" : name]}
                  labelFormatter={(l) => `Anno ${l}`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: T.textSecondary, fontFamily: "'Syne'" }}
                  formatter={(v) => v === "invested" ? "Versato" : v === "total" ? "Totale portafoglio" : v}
                />
                <Area type="monotone" dataKey="invested" name="invested" stroke={T.border} fill="transparent" strokeDasharray="5 3" strokeWidth={1.5} dot={false} />
                {portfolio.holdings.map((h) => (
                  <Area key={h.symbol} type="monotone" dataKey={h.symbol} stroke={h.color} fill={`url(#g-${h.symbol})`} strokeWidth={2} dot={false} />
                ))}
                <Area type="monotone" dataKey="total" name="total" stroke={T.text} fill="transparent" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Milestones table */}
          <div style={{ overflowX: "auto", borderRadius: 4, border: `1px solid ${T.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 400 }}>
              <thead>
                <tr style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ textAlign: "left", padding: "11px 16px", color: T.textSecondary, fontWeight: 700, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>Titolo</th>
                  {MILESTONES.map((y) => (
                    <th key={y} style={{ textAlign: "right", padding: "11px 16px", color: T.textSecondary, fontWeight: 700, fontSize: 10, letterSpacing: "0.09em", whiteSpace: "nowrap", fontFamily: "'Syne', sans-serif" }}>
                      {y} ANNI
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((h, i) => (
                  <tr key={h.symbol} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 ? T.surface : T.bg }}>
                    <td style={{ padding: "11px 16px", fontWeight: 700, color: h.color, letterSpacing: "0.06em", fontFamily: "Georgia, 'Times New Roman', serif" }}>{h.symbol}</td>
                    {MILESTONES.map((y) => (
                      <td key={y} style={{ textAlign: "right", padding: "11px 16px", color: T.text, ...NUM }}>
                        {fmtCHF(calcDCA(h.monthly, scenarioRate(h) / 100, y))}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ background: T.primaryLight, borderTop: `1px solid ${T.primaryBorder}` }}>
                  <td style={{ padding: "11px 16px", fontWeight: 700, color: T.primary, letterSpacing: "0.09em", fontFamily: "'Syne', sans-serif" }}>TOTALE</td>
                  {MILESTONES.map((y) => (
                    <td key={y} style={{ textAlign: "right", padding: "11px 16px", fontWeight: 700, color: T.primary, ...NUM }}>
                      {fmtCHF(portfolio.holdings.reduce((s, h) => s + calcDCA(h.monthly, scenarioRate(h) / 100, y), 0))}
                    </td>
                  ))}
                </tr>
                <tr style={{ background: T.surface }}>
                  <td style={{ padding: "6px 16px", fontSize: 11, color: T.textMuted, letterSpacing: "0.04em", fontFamily: "'Syne', sans-serif" }}>di cui versato</td>
                  {MILESTONES.map((y) => {
                    const inv = totalMonthly * 12 * y;
                    const tot = portfolio.holdings.reduce((s, h) => s + calcDCA(h.monthly, scenarioRate(h) / 100, y), 0);
                    return (
                      <td key={y} style={{ textAlign: "right", padding: "6px 16px", fontSize: 11, color: T.textSecondary, ...NUM }}>
                        {fmtCHF(inv)} · ×{(tot / (inv || 1)).toFixed(1)}
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

// ─── ADD TO PORTFOLIO MODAL ───────────────────────────────────────────────────
function AddToPortfolioModal({ stock, portfolios, onConfirm, onAddNew, onClose }) {
  const [selected, setSelected] = useState(portfolios[0]?.id ?? null);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: T.bg, borderRadius: 6,
        border: `1px solid ${T.border}`,
        padding: "28px", width: "100%", maxWidth: 380,
        boxShadow: "0 8px 48px rgba(0,0,0,0.12)",
        fontFamily: "'Syne', system-ui, sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: "0.09em", textTransform: "uppercase" }}>
              Aggiungi al portafoglio
            </div>
            <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 4 }}>
              {stock.symbol} · {stock.name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 2, flexShrink: 0 }}
          >×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {portfolios.map((pf) => (
            <button
              key={pf.id}
              onClick={() => setSelected(pf.id)}
              style={{
                background: selected === pf.id ? T.primaryLight : T.surface,
                border: `1px solid ${selected === pf.id ? T.primary : T.border}`,
                borderRadius: 4, padding: "13px 16px",
                textAlign: "left", cursor: "pointer", fontFamily: "'Syne', sans-serif",
                transition: "border-color .12s",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{pf.name}</div>
              <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
                {pf.holdings.length === 0
                  ? "Nessun titolo"
                  : `${pf.holdings.length} ${pf.holdings.length === 1 ? "titolo" : "titoli"}`}
              </div>
            </button>
          ))}
          <button
            onClick={onAddNew}
            style={{
              background: "transparent", border: `1px dashed ${T.border}`,
              borderRadius: 4, padding: "13px 16px",
              textAlign: "left", cursor: "pointer", fontFamily: "'Syne', sans-serif",
              color: T.textSecondary, fontSize: 13, fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            + Crea nuovo portafoglio
          </button>
        </div>

        <button
          onClick={() => onConfirm(selected)}
          disabled={selected === null}
          style={{
            width: "100%", background: T.primary, color: "#fff",
            border: "none", borderRadius: 3, padding: "14px 0",
            fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Syne', sans-serif",
            letterSpacing: "0.09em", textTransform: "uppercase",
          }}
        >
          Aggiungi
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
let _id = 1;
const makePortfolio = () => {
  const id = _id++;
  return {
    id,
    supabase_id: crypto.randomUUID(),
    name: id === 1 ? "Il mio portafoglio" : `Portafoglio ${id}`,
    holdings: [],
  };
};

export default function App() {
  const { user, logout } = useAuth();

  const [portfolios, setPortfolios] = useState([makePortfolio()]);
  const [selectedPf, setSelectedPf] = useState(1);
  const [exploreStock, setExploreStock] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [softGateOpen, setSoftGateOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState("signup");
  const [addModal, setAddModal] = useState({ open: false, stock: null });
  const [activePage, setActivePage] = useState("search");

  // ── Supabase sync ──────────────────────────────────────────────────────────
  const saveTimerRef = useRef(null);
  const canSaveRef = useRef(false);

  const loadPortfolios = async (uid) => {
    canSaveRef.current = false;
    console.log("[investsim] loadPortfolios → uid:", uid);
    const { data, error } = await supabase
      .from("portfolios")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });
    console.log("[investsim] loadPortfolios ← data:", data, "error:", error);
    if (data?.length) {
      _id = data.length + 1;
      setPortfolios(data.map((row, i) => ({
        id: i + 1,
        supabase_id: row.id,
        name: row.name,
        holdings: row.holdings ?? [],
      })));
      setSelectedPf(1);
    }
    setTimeout(() => {
      canSaveRef.current = true;
      console.log("[investsim] canSaveRef → true (save unlocked)");
    }, 100);
  };

  useEffect(() => {
    console.log("[investsim] user effect → user:", user?.email ?? null);
    if (user) {
      loadPortfolios(user.id);
    } else {
      canSaveRef.current = false;
      _id = 1;
      setPortfolios([makePortfolio()]);
      setSelectedPf(1);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    console.log("[investsim] save effect → user:", user?.email ?? null, "| canSave:", canSaveRef.current, "| portfolios:", portfolios.length);
    if (!user || !canSaveRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      console.log("[investsim] upsert start → portfolios to save:", portfolios.map((p) => ({ supabase_id: p.supabase_id, name: p.name, holdings: p.holdings.length })));
      for (const pf of portfolios) {
        const { data, error } = await supabase.from("portfolios").upsert({
          id: pf.supabase_id,
          user_id: user.id,
          name: pf.name,
          holdings: pf.holdings,
          updated_at: new Date().toISOString(),
        });
        console.log("[investsim] upsert ←", pf.name, "| data:", data, "| error:", error);
      }
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [portfolios, user]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── end Supabase sync ──────────────────────────────────────────────────────

  const currentPf = portfolios.find((p) => p.id === selectedPf);

  const addHolding = (stock, portfolioId) => {
    const targetId = portfolioId ?? selectedPf;
    const isFirstHolding = portfolios.every((p) => p.holdings.length === 0);
    setPortfolios((pfs) =>
      pfs.map((p) =>
        p.id === targetId
          ? {
              ...p,
              holdings: p.holdings.find((h) => h.symbol === stock.symbol)
                ? p.holdings.map((h) => h.symbol === stock.symbol ? { ...h, monthly: h.monthly + stock.monthly } : h)
                : [...p.holdings, stock],
            }
          : p
      )
    );
    setSelectedPf(targetId);
    setSidebarOpen(false);
    if (isFirstHolding && !user && !localStorage.getItem("investsim_gate_shown")) {
      setSoftGateOpen(true);
    }
  };

  const updatePf = (updated) => setPortfolios((pfs) => pfs.map((p) => p.id === updated.id ? updated : p));

  const addPortfolio = () => {
    const pf = makePortfolio();
    setPortfolios((p) => [...p, pf]);
    setSelectedPf(pf.id);
  };

  const deletePf = async (id) => {
    const pf = portfolios.find((p) => p.id === id);
    if (user && pf?.supabase_id) {
      await supabase.from("portfolios").delete().eq("id", pf.supabase_id);
    }
    const remaining = portfolios.filter((p) => p.id !== id);
    setPortfolios(remaining.length ? remaining : [makePortfolio()]);
    setSelectedPf(remaining[0]?.id || 1);
  };

  const selectPf = (id) => {
    setSelectedPf(id);
    setSidebarOpen(false);
    setActivePage("portfolio");
  };

  return (
    <div style={{
      background: T.bg, minHeight: "100vh", color: T.text,
      fontFamily: "'Syne', system-ui, -apple-system, sans-serif",
      fontSize: 15,
    }}>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 40 }}
        />
      )}

      {/* Sidebar */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 288,
        background: T.bg, borderRight: `1px solid ${T.border}`,
        zIndex: 50, padding: 16,
        display: "flex", flexDirection: "column", gap: 8,
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .25s cubic-bezier(.4,0,.2,1)",
        overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 11, color: T.textSecondary, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'Syne', sans-serif" }}>
            I tuoi portafogli
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}
          >×</button>
        </div>

        {portfolios.map((p) => (
          <PortfolioCard key={p.id} portfolio={p} selected={p.id === selectedPf} onSelect={selectPf} onDelete={deletePf} />
        ))}

        <button
          onClick={addPortfolio}
          style={{
            background: "transparent", border: `1px dashed ${T.border}`,
            borderRadius: 4, color: T.textSecondary,
            padding: "11px 0", fontSize: 11, fontWeight: 700,
            cursor: "pointer", marginTop: 4, fontFamily: "'Syne', sans-serif",
            letterSpacing: "0.09em", textTransform: "uppercase",
          }}
        >
          + Nuovo portafoglio
        </button>
      </div>

      {/* Header */}
      <header style={{
        background: T.bg, borderBottom: `1px solid ${T.border}`,
        padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 14,
        position: "sticky", top: 0, zIndex: 30,
      }}>
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            background: "transparent", border: `1px solid ${T.border}`, borderRadius: 3,
            color: T.textSecondary, cursor: "pointer", padding: "7px 10px", fontSize: 14, lineHeight: 1,
          }}
        >☰</button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          {/* Logo */}
          <img
            src="/logo-wisinvest.png"
            alt="WisiInvest"
            style={{ height: 44, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />

          {/* Brand name */}
          <span style={{
            fontSize: 16, fontWeight: 800, color: T.primary,
            textTransform: "uppercase", letterSpacing: "0.10em",
            fontFamily: "'Syne', sans-serif", flexShrink: 0,
          }}>INVEST</span>

          {/* Nav tabs */}
          <div style={{
            display: "flex", gap: 2, background: T.surface,
            borderRadius: 3, padding: 3, border: `1px solid ${T.border}`, flexShrink: 0,
          }}>
            {[["search", "Cerca"], ["portfolio", "Portafoglio"]].map(([page, label]) => (
              <button
                key={page}
                onClick={() => setActivePage(page)}
                style={{
                  background: activePage === page ? T.primary : "transparent",
                  color: activePage === page ? "#fff" : T.textSecondary,
                  border: "none", borderRadius: 2, padding: "6px 14px",
                  fontSize: 11, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'Syne', sans-serif",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  transition: "background .15s, color .15s",
                }}
              >{label}</button>
            ))}
          </div>
        </div>

        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: T.textMuted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.email}
            </span>
            <button
              onClick={logout}
              style={{
                background: "transparent", border: `1px solid ${T.border}`,
                borderRadius: 3, color: T.textSecondary,
                fontSize: 11, fontWeight: 700, padding: "6px 12px",
                cursor: "pointer", fontFamily: "'Syne', sans-serif",
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}
            >Esci</button>
          </div>
        ) : (
          <button
            onClick={() => { setAuthModalTab("login"); setAuthModalOpen(true); }}
            style={{
              background: T.primary, border: "none", borderRadius: 3,
              color: "#fff", fontSize: 11, fontWeight: 700,
              padding: "8px 16px", cursor: "pointer", fontFamily: "'Syne', sans-serif",
              flexShrink: 0, letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >Accedi</button>
        )}
      </header>

      {/* Main */}
      <main style={{ padding: "28px 20px", maxWidth: 720, margin: "0 auto" }}>
        {activePage === "search" && (
          <>
            <SearchPanel
              onAdd={(stock) => setAddModal({ open: true, stock })}
              onExplore={(s) => setExploreStock(s)}
            />
            {exploreStock && (
              <div style={{ marginTop: 18 }}>
                <ExplorePanel stock={exploreStock} onClose={() => setExploreStock(null)} />
              </div>
            )}
          </>
        )}

        {activePage === "portfolio" && currentPf && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
              <button
                onClick={() => setActivePage("search")}
                style={{
                  background: T.primary, color: "#fff", border: "none",
                  borderRadius: 3, padding: "10px 20px",
                  fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "'Syne', sans-serif",
                  letterSpacing: "0.09em", textTransform: "uppercase",
                }}
              >+ Aggiungi titolo</button>
            </div>
            <PortfolioEditor
              portfolio={currentPf}
              onChange={updatePf}
              onGoToSearch={() => setActivePage("search")}
            />
          </div>
        )}
      </main>

      {/* Add-to-portfolio modal */}
      {addModal.open && (
        <AddToPortfolioModal
          stock={addModal.stock}
          portfolios={portfolios}
          onConfirm={(portfolioId) => {
            addHolding(addModal.stock, portfolioId);
            setAddModal({ open: false, stock: null });
          }}
          onAddNew={() => {
            const stock = addModal.stock;
            const pf = makePortfolio();
            const isFirstHolding = portfolios.every((p) => p.holdings.length === 0);
            setPortfolios((prev) => [...prev, { ...pf, holdings: [stock] }]);
            setSelectedPf(pf.id);
            setAddModal({ open: false, stock: null });
            if (isFirstHolding && !user && !localStorage.getItem("investsim_gate_shown")) {
              setSoftGateOpen(true);
            }
          }}
          onClose={() => setAddModal({ open: false, stock: null })}
        />
      )}

      {/* Soft gate modal */}
      {softGateOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }}>
          <div style={{
            background: T.bg, borderRadius: 6,
            border: `1px solid ${T.border}`,
            padding: "44px 32px", width: "100%", maxWidth: 380,
            boxShadow: "0 8px 48px rgba(0,0,0,0.12)", textAlign: "center",
            fontFamily: "'Syne', system-ui, sans-serif",
          }}>
            <div style={{ fontSize: 38, marginBottom: 22 }}>💾</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: "0 0 12px", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "Georgia, 'Times New Roman', serif" }}>
              Salva i tuoi portafogli
            </h2>
            <p style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.75, margin: "0 0 32px" }}>
              Crea un account gratuito per ritrovare i tuoi portafogli ogni volta che torni.
              Altrimenti verranno persi alla chiusura del browser.
            </p>
            <button
              onClick={() => {
                setSoftGateOpen(false);
                setAuthModalTab("signup");
                setAuthModalOpen(true);
              }}
              style={{
                width: "100%", background: T.primary, color: "#fff",
                border: "none", borderRadius: 3, padding: "14px 0",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
                fontFamily: "'Syne', sans-serif", marginBottom: 10,
                letterSpacing: "0.09em", textTransform: "uppercase",
              }}
            >
              Crea account gratuito
            </button>
            <button
              onClick={() => {
                localStorage.setItem("investsim_gate_shown", "1");
                setSoftGateOpen(false);
              }}
              style={{
                width: "100%", background: "transparent", color: T.textSecondary,
                border: `1px solid ${T.border}`, borderRadius: 3, padding: "13px 0",
                fontWeight: 700, fontSize: 11, cursor: "pointer",
                fontFamily: "'Syne', sans-serif",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}
            >
              Continua senza account
            </button>
          </div>
        </div>
      )}

      {/* Auth modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab={authModalTab}
        onSuccess={() => localStorage.setItem("investsim_gate_shown", "1")}
      />
    </div>
  );
}
