import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

// Load Inter
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
document.head.appendChild(fontLink);

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg: "#F9FAFB",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#111827",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  blue: "#2563EB",
  blueLight: "#EFF6FF",
  blueBorder: "#BFDBFE",
  green: "#16A34A",
  greenLight: "#F0FDF4",
  greenBorder: "#BBF7D0",
  red: "#DC2626",
  redLight: "#FEF2F2",
  yellow: "#D97706",
  yellowLight: "#FFFBEB",
};

const CHART_COLORS = [
  "#2563EB", "#16A34A", "#D97706", "#7C3AED", "#0891B2",
  "#DC2626", "#059669", "#9333EA", "#0284C7", "#B45309",
];

const RISK_LABEL = { Low: "Basso", Medium: "Medio", High: "Alto", "Very High": "Molto alto" };
const RISK_COLOR = {
  Low:        { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  Medium:     { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  High:       { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  "Very High":{ bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
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
      background: T.blueLight, color: T.blue, border: `1px solid ${T.blueBorder}`,
      fontSize: 12, fontWeight: 500, borderRadius: 6, padding: "2px 10px",
    }}>{children}</span>
  );
}

function RiskBadge({ risk }) {
  const c = RISK_COLOR[risk] || { bg: "#F3F4F6", text: "#6B7280", border: "#E5E7EB" };
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      fontSize: 12, fontWeight: 500, borderRadius: 6, padding: "2px 10px",
    }}>Rischio {RISK_LABEL[risk] || risk}</span>
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
      if (data.symbol === "NOT_FOUND" || !data.estimatedAnnualReturn) {
        setError("Non abbiamo trovato questo titolo. Prova con un nome diverso, ad esempio: Apple, S&P 500, Oro.");
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
      {/* Hero — visible only before the first search result */}
      {!result && (
        <div style={{ textAlign: "center", padding: "40px 8px 28px" }}>
          <h1 style={{
            fontSize: "clamp(22px, 5vw, 38px)", fontWeight: 700,
            color: T.text, margin: "0 0 12px", lineHeight: 1.25,
          }}>
            Scopri quanto può crescere<br />il tuo denaro
          </h1>
          <p style={{ fontSize: 16, color: T.textSecondary, margin: "0 0 28px", lineHeight: 1.6, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            Cerca un'azione, un ETF o un indice. Simuliamo insieme il suo potenziale nel tempo.
          </p>
        </div>
      )}

      {/* Search bar */}
      <div style={{ maxWidth: result ? "100%" : 580, margin: result ? "0 0 20px" : "0 auto 14px" }}>
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          background: T.surface,
          border: `1.5px solid ${result ? T.border : T.blue}`,
          borderRadius: 14, padding: "6px 6px 6px 16px",
          boxShadow: result ? "none" : "0 2px 16px rgba(37,99,235,0.10)",
        }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Esempio: Apple, S&P 500, Bitcoin, Oro…"
            style={{
              flex: 1, border: "none", outline: "none",
              fontSize: 16, color: T.text, background: "transparent",
              fontFamily: "inherit", minWidth: 0,
            }}
          />
          <button
            onClick={search}
            disabled={loading}
            style={{
              background: loading ? T.textMuted : T.blue, color: "#fff",
              border: "none", borderRadius: 10, padding: "10px 20px",
              fontWeight: 600, fontSize: 15, cursor: loading ? "default" : "pointer",
              fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            {loading ? "Cerco…" : "Cerca"}
          </button>
        </div>

        {!result && (
          <p style={{ textAlign: "center", fontSize: 13, color: T.textMuted, marginTop: 10 }}>
            Popolari: Apple · S&P 500 · Tesla · Oro · QQQ · Bitcoin
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: T.redLight, border: `1px solid #FECACA`,
          borderRadius: 10, padding: "12px 16px",
          color: T.red, fontSize: 14, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Result card */}
      {result && (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 16, padding: "20px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{result.symbol}</span>
                <span style={{ fontSize: 15, color: T.textSecondary }}>{result.name}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <Badge>{result.type}</Badge>
                <RiskBadge risk={result.risk} />
              </div>
            </div>
            {result.currentPrice && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: T.textMuted }}>Prezzo indicativo</div>
                <div style={{ fontSize: 17, fontWeight: 600, color: T.text }}>
                  {result.currency} {result.currentPrice}
                </div>
              </div>
            )}
          </div>

          <p style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.65, marginBottom: 18 }}>
            {result.description}
          </p>

          {/* Return highlight */}
          <div style={{
            background: T.greenLight, border: `1px solid ${T.greenBorder}`,
            borderRadius: 12, padding: "14px 18px", marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 4 }}>
              Rendimento medio annuo stimato (dati storici)
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: T.green, lineHeight: 1 }}>
              +{result.estimatedAnnualReturn}%
            </div>
            <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 6, lineHeight: 1.5 }}>
              {result.returnBasis}
            </div>
          </div>

          {/* Monthly slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: T.text }}>
                Quanto vorresti mettere da parte ogni mese?
              </span>
              <span style={{ fontSize: 17, fontWeight: 700, color: T.blue, flexShrink: 0, marginLeft: 8 }}>
                CHF {monthly.toLocaleString("it-CH")}
              </span>
            </div>
            <input
              type="range" min={50} max={3000} step={50} value={monthly}
              onChange={(e) => setMonthly(Number(e.target.value))}
              style={{ width: "100%", accentColor: T.blue }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted, marginTop: 4 }}>
              <span>CHF 50</span><span>CHF 3.000</span>
            </div>
          </div>

          {/* Quick projections */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}>
            {[10, 20, 30].map((y) => {
              const fv = calcDCA(monthly, result.estimatedAnnualReturn / 100, y);
              const inv = monthly * 12 * y;
              return (
                <div key={y} style={{
                  background: T.bg, borderRadius: 10, padding: "12px 10px",
                  textAlign: "center", border: `1px solid ${T.border}`,
                }}>
                  <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 5 }}>Dopo {y} anni</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{fmtK(fv)}</div>
                  <div style={{ fontSize: 11, color: T.green, marginTop: 3 }}>
                    +{Math.round((fv / inv - 1) * 100)}% sul versato
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => onAdd({ ...result, monthly, color: CHART_COLORS[Math.floor(Math.random() * CHART_COLORS.length)], rate: result.estimatedAnnualReturn })}
              style={{
                flex: 1, minWidth: 140, background: T.blue, color: "#fff",
                border: "none", borderRadius: 10, padding: "13px 16px",
                fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Aggiungi al portafoglio
            </button>
            <button
              onClick={() => onExplore(result)}
              style={{
                flex: 1, minWidth: 140, background: T.surface, color: T.blue,
                border: `1.5px solid ${T.blue}`, borderRadius: 10, padding: "13px 16px",
                fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Vedi simulazione completa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EXPLORE PANEL ────────────────────────────────────────────────────────────
function ExplorePanel({ stock, onClose }) {
  const data = buildChartData([{ ...stock, monthly: 500, color: T.blue }], 30);
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 16, padding: "20px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{stock.symbol}</span>
          <span style={{ fontSize: 13, color: T.textSecondary, marginLeft: 10 }}>
            simulazione con CHF 500/mese
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
            <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.blue} stopOpacity={0.15} />
              <stop offset="95%" stopColor={T.blue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="year" stroke={T.textMuted} tick={{ fontSize: 11, fill: T.textMuted }} tickFormatter={(v) => `${v}a`} />
          <YAxis stroke={T.textMuted} tick={{ fontSize: 11, fill: T.textMuted }} tickFormatter={fmtK} />
          <Tooltip
            contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13 }}
            formatter={(v, name) => [fmtCHF(v), name === "invested" ? "Versato" : stock.symbol]}
            labelFormatter={(l) => `Anno ${l}`}
          />
          <Area type="monotone" dataKey={stock.symbol} stroke={T.blue} fill="url(#eg)" strokeWidth={2.5} dot={false} />
          <Area type="monotone" dataKey="invested" stroke={T.textMuted} fill="transparent" strokeDasharray="5 3" strokeWidth={1.5} dot={false} name="invested" />
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginTop: 16 }}>
        {MILESTONES.map((y) => {
          const fv = calcDCA(500, stock.estimatedAnnualReturn / 100, y);
          const inv = 500 * 12 * y;
          return (
            <div key={y} style={{
              background: T.bg, borderRadius: 8, padding: "10px 6px",
              textAlign: "center", border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 11, color: T.textMuted }}>{y} anni</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 4 }}>{fmtK(fv)}</div>
              <div style={{ fontSize: 10, color: T.green }}>×{(fv / inv).toFixed(1)}</div>
            </div>
          );
        })}
      </div>
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
        background: selected ? T.blueLight : T.surface,
        border: `1.5px solid ${selected ? T.blue : T.border}`,
        borderRadius: 12, padding: 16, cursor: "pointer",
        transition: "border-color .15s", position: "relative",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(portfolio.id); }}
        style={{
          position: "absolute", top: 10, right: 10,
          background: "transparent", border: "none",
          color: T.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 2,
        }}
      >×</button>
      <div style={{ fontWeight: 600, fontSize: 15, color: T.text, marginBottom: 4, paddingRight: 20 }}>
        {portfolio.name}
      </div>
      <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 10 }}>
        CHF {total.toLocaleString("it-CH")} al mese · {portfolio.holdings.length}{" "}
        {portfolio.holdings.length === 1 ? "titolo" : "titoli"}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {portfolio.holdings.map((h) => (
          <span key={h.symbol} style={{
            fontSize: 11, background: T.bg, color: T.textSecondary,
            border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 7px",
          }}>
            {h.symbol}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── PORTFOLIO EDITOR ─────────────────────────────────────────────────────────
function PortfolioEditor({ portfolio, onChange }) {
  const [mode, setMode] = useState("amount");
  const totalMonthly = portfolio.holdings.reduce((s, h) => s + h.monthly, 0);

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

  const chartData = buildChartData(portfolio.holdings);

  return (
    <div>
      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          value={portfolio.name}
          onChange={(e) => onChange({ ...portfolio, name: e.target.value })}
          style={{
            background: "transparent", border: "none",
            borderBottom: `2px solid ${T.blue}`,
            color: T.text, fontWeight: 700, fontSize: 20,
            padding: "4px 0", outline: "none", fontFamily: "inherit",
          }}
        />
        {totalMonthly > 0 && (
          <span style={{ fontSize: 14, color: T.textSecondary }}>
            CHF {totalMonthly.toLocaleString("it-CH")} al mese in totale
          </span>
        )}
      </div>

      {/* Mode toggle */}
      {portfolio.holdings.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[["amount", "Modifica importi"], ["percent", "Modifica percentuali"]].map(([m, label]) => (
            <button
              key={m}
              onClick={() => { if (m === "percent") initPercent(); setMode(m); }}
              style={{
                background: mode === m ? T.blue : T.surface,
                color: mode === m ? "#fff" : T.textSecondary,
                border: `1.5px solid ${mode === m ? T.blue : T.border}`,
                borderRadius: 8, padding: "7px 14px",
                fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Holdings list */}
      {portfolio.holdings.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 16px",
          background: T.bg, borderRadius: 12,
          border: `1.5px dashed ${T.border}`,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: 8 }}>Il portafoglio è vuoto</div>
          <div style={{ fontSize: 14, color: T.textSecondary }}>
            Vai su "Cerca titoli" e aggiungi qualcosa per iniziare.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {portfolio.holdings.map((h) => (
            <div key={h.symbol} style={{
              background: T.surface, borderRadius: 12,
              padding: "14px 16px", border: `1px solid ${T.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: h.color }}>{h.symbol}</span>
                    <span style={{ fontSize: 13, color: T.textSecondary }}>{h.name?.substring(0, 35)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.green, marginTop: 3 }}>
                    Rendimento storico stimato: +{h.rate}% annuo
                  </div>
                </div>
                <button
                  onClick={() => removeHolding(h.symbol)}
                  style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 2 }}
                >×</button>
              </div>

              {mode === "amount" ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: T.textSecondary }}>Investimento mensile</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
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
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: T.textSecondary }}>Quota del totale</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{h._pct || 0}%</span>
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
              background: T.blueLight, borderRadius: 12,
              padding: "14px 16px", border: `1px solid ${T.blueBorder}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>
                  Totale mensile da distribuire
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.blue }}>
                  CHF {totalMonthly.toLocaleString("it-CH")}
                </span>
              </div>
              <input
                type="range" min={100} max={10000} step={100}
                defaultValue={totalMonthly || 1000}
                onChange={(e) => setFromPercent(Number(e.target.value))}
                style={{ width: "100%", accentColor: T.blue }}
              />
            </div>
          )}
        </div>
      )}

      {/* Chart + table */}
      {portfolio.holdings.length > 0 && (
        <>
          <div style={{ fontWeight: 600, fontSize: 16, color: T.text, marginBottom: 4 }}>
            Come potrebbe crescere il tuo portafoglio
          </div>
          <p style={{ fontSize: 13, color: T.textSecondary, marginBottom: 16, lineHeight: 1.5 }}>
            Simulazione basata sui rendimenti storici. I risultati passati non garantiscono quelli futuri.
          </p>

          <div style={{
            background: T.surface, borderRadius: 12, padding: 16,
            border: `1px solid ${T.border}`, marginBottom: 20,
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
                <XAxis dataKey="year" stroke={T.textMuted} tick={{ fontSize: 11, fill: T.textMuted }} tickFormatter={(v) => `${v}a`} />
                <YAxis stroke={T.textMuted} tick={{ fontSize: 11, fill: T.textMuted }} tickFormatter={fmtK} />
                <Tooltip
                  contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [fmtCHF(v), name === "invested" ? "Versato" : name === "total" ? "Totale" : name]}
                  labelFormatter={(l) => `Anno ${l}`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: T.textSecondary }}
                  formatter={(v) => v === "invested" ? "Versato" : v === "total" ? "Totale portafoglio" : v}
                />
                <Area type="monotone" dataKey="invested" name="invested" stroke={T.textMuted} fill="transparent" strokeDasharray="5 3" strokeWidth={1.5} dot={false} />
                {portfolio.holdings.map((h) => (
                  <Area key={h.symbol} type="monotone" dataKey={h.symbol} stroke={h.color} fill={`url(#g-${h.symbol})`} strokeWidth={2} dot={false} />
                ))}
                <Area type="monotone" dataKey="total" name="total" stroke={T.blue} fill="transparent" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Milestones table */}
          <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${T.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 400 }}>
              <thead>
                <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", color: T.textSecondary, fontWeight: 500 }}>Titolo</th>
                  {MILESTONES.map((y) => (
                    <th key={y} style={{ textAlign: "right", padding: "10px 14px", color: T.textSecondary, fontWeight: 500, whiteSpace: "nowrap" }}>
                      {y} anni
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((h, i) => (
                  <tr key={h.symbol} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 ? T.bg : T.surface }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: h.color }}>{h.symbol}</td>
                    {MILESTONES.map((y) => (
                      <td key={y} style={{ textAlign: "right", padding: "10px 14px", color: T.text }}>
                        {fmtCHF(calcDCA(h.monthly, h.rate / 100, y))}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ background: T.blueLight, borderTop: `2px solid ${T.blue}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: T.blue }}>Totale</td>
                  {MILESTONES.map((y) => (
                    <td key={y} style={{ textAlign: "right", padding: "10px 14px", fontWeight: 700, color: T.blue }}>
                      {fmtCHF(portfolio.holdings.reduce((s, h) => s + calcDCA(h.monthly, h.rate / 100, y), 0))}
                    </td>
                  ))}
                </tr>
                <tr style={{ background: T.bg }}>
                  <td style={{ padding: "6px 14px", fontSize: 12, color: T.textMuted }}>di cui versato</td>
                  {MILESTONES.map((y) => {
                    const inv = totalMonthly * 12 * y;
                    const tot = portfolio.holdings.reduce((s, h) => s + calcDCA(h.monthly, h.rate / 100, y), 0);
                    return (
                      <td key={y} style={{ textAlign: "right", padding: "6px 14px", fontSize: 12, color: T.textSecondary }}>
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
let _id = 1;
const makePortfolio = () => {
  const id = _id++;
  return { id, name: id === 1 ? "Il mio portafoglio" : `Portafoglio ${id}`, holdings: [] };
};

export default function App() {
  const [portfolios, setPortfolios] = useState([makePortfolio()]);
  const [selectedPf, setSelectedPf] = useState(1);
  const [exploreStock, setExploreStock] = useState(null);
  const [tab, setTab] = useState("search");
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

  const updatePf = (updated) => setPortfolios((pfs) => pfs.map((p) => p.id === updated.id ? updated : p));

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

  return (
    <div style={{
      background: T.bg, minHeight: "100vh", color: T.text,
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      fontSize: 15,
    }}>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }}
        />
      )}

      {/* Sidebar */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 296,
        background: T.surface, borderRight: `1px solid ${T.border}`,
        zIndex: 50, padding: 16,
        display: "flex", flexDirection: "column", gap: 8,
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .25s cubic-bezier(.4,0,.2,1)",
        overflowY: "auto",
        boxShadow: "4px 0 20px rgba(0,0,0,0.07)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>I tuoi portafogli</span>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}
          >×</button>
        </div>

        {portfolios.map((p) => (
          <PortfolioCard key={p.id} portfolio={p} selected={p.id === selectedPf} onSelect={selectPf} onDelete={deletePf} />
        ))}

        <button
          onClick={addPortfolio}
          style={{
            background: "transparent", border: `1.5px dashed ${T.border}`,
            borderRadius: 12, color: T.textSecondary,
            padding: "12px 0", fontSize: 14, fontWeight: 500,
            cursor: "pointer", marginTop: 4, fontFamily: "inherit",
          }}
        >
          + Nuovo portafoglio
        </button>
      </div>

      {/* Header */}
      <header style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 30,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
            color: T.text, cursor: "pointer", padding: "7px 10px", fontSize: 15, lineHeight: 1,
          }}
        >☰</button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.blue, flexShrink: 0 }}>InvestSim</span>
          <span style={{
            fontSize: 11, color: T.blue, background: T.blueLight,
            border: `1px solid ${T.blueBorder}`, borderRadius: 6,
            padding: "2px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {currentPf?.name || "Portafoglio"}
          </span>
        </div>

        <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>Solo simulazione</span>
      </header>

      {/* Main */}
      <main style={{ padding: "16px", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[["search", "Cerca titoli"], ["portfolio", "Il mio portafoglio"]].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? T.blue : T.surface,
                color: tab === t ? "#fff" : T.textSecondary,
                border: `1.5px solid ${tab === t ? T.blue : T.border}`,
                borderRadius: 10, padding: "9px 18px",
                fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
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
      </main>
    </div>
  );
}
