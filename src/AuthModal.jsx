import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const T = {
  bg:            "#FFFFFF",
  surface:       "#F8F8F8",
  border:        "#E8E8E8",
  text:          "#111111",
  textSecondary: "#666666",
  textMuted:     "#AAAAAA",
  primary:       "#E8352A",
  primaryLight:  "rgba(232,53,42,0.06)",
  red:           "#E8352A",
  redLight:      "rgba(232,53,42,0.06)",
};

function Field({ label, type, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontSize: 10, fontWeight: 700, color: T.textSecondary,
        marginBottom: 7, letterSpacing: "0.10em", textTransform: "uppercase",
        fontFamily: "'Syne', sans-serif",
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "current-password" : "email"}
        style={{
          width: "100%", boxSizing: "border-box",
          border: `1.5px solid ${T.border}`, borderRadius: 3,
          padding: "11px 14px", fontSize: 14, color: T.text,
          background: T.bg, outline: "none",
          fontFamily: "'Syne', sans-serif",
          transition: "border-color .15s",
        }}
        onFocus={(e) => { e.target.style.borderColor = T.primary; }}
        onBlur={(e) => { e.target.style.borderColor = T.border; }}
      />
    </div>
  );
}

export default function AuthModal({ open, onClose, defaultTab = "login", onSuccess }) {
  const { login, signup } = useAuth();
  const [tab, setTab] = useState(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setError(null);
      setLoading(false);
    }
  }, [open, defaultTab]);

  const reset = () => {
    setEmail(""); setPassword(""); setConfirmPassword("");
    setError(null); setLoading(false);
  };

  const close = () => { reset(); onClose(); };

  const switchTab = (t) => { setTab(t); setError(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (tab === "signup" && password !== confirmPassword) {
      setError("Le password non corrispondono.");
      return;
    }
    if (password.length < 6) {
      setError("La password deve avere almeno 6 caratteri.");
      return;
    }

    setLoading(true);
    const fn = tab === "login" ? login : signup;
    const { error: authError } = await fn(email, password);

    if (authError) {
      const messages = {
        "Invalid login credentials": "Email o password errati.",
        "Email not confirmed": "Controlla la tua email per confermare l'account.",
        "User already registered": "Esiste già un account con questa email. Prova ad accedere.",
      };
      setError(messages[authError.message] || authError.message);
      setLoading(false);
    } else {
      reset();
      onSuccess?.();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.30)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div style={{
        background: T.bg, borderRadius: 6,
        border: `1px solid ${T.border}`,
        padding: "32px 28px", width: "100%", maxWidth: 400,
        boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
        fontFamily: "'Syne', system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <span style={{
            fontSize: 15, fontWeight: 800, color: T.primary,
            letterSpacing: "0.12em", textTransform: "uppercase",
            fontFamily: "'Syne', sans-serif",
          }}>INVEST</span>
          <button
            onClick={close}
            style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 2 }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", background: T.surface,
          borderRadius: 3, padding: 3, marginBottom: 26,
          border: `1px solid ${T.border}`,
        }}>
          {[["login", "Accedi"], ["signup", "Registrati"]].map(([t, label]) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                flex: 1, padding: "8px 0", border: "none",
                borderRadius: 2, fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "'Syne', sans-serif",
                background: tab === t ? T.primary : "transparent",
                color: tab === t ? "#fff" : T.textSecondary,
                letterSpacing: "0.08em", textTransform: "uppercase",
                transition: "all .15s",
              }}
            >{label}</button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="la@tua.email" />
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="almeno 6 caratteri" />
          {tab === "signup" && (
            <Field label="Conferma password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="ripeti la password" />
          )}

          {error && (
            <div style={{
              background: T.redLight, border: `1px solid rgba(232,53,42,0.18)`,
              borderRadius: 3, padding: "10px 14px",
              color: T.red, fontSize: 13, marginBottom: 16,
              fontFamily: "'Syne', sans-serif",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", background: loading ? T.textMuted : T.primary,
              color: "#fff", border: "none", borderRadius: 3,
              padding: "14px 0", fontWeight: 700, fontSize: 12,
              cursor: loading ? "default" : "pointer",
              fontFamily: "'Syne', sans-serif",
              letterSpacing: "0.09em", textTransform: "uppercase",
            }}
          >
            {loading ? "Un attimo…" : tab === "login" ? "Accedi" : "Crea account gratuito"}
          </button>
        </form>

        {/* Switch link */}
        <p style={{ textAlign: "center", fontSize: 13, color: T.textSecondary, marginTop: 18, marginBottom: 0 }}>
          {tab === "login" ? (
            <>Non hai un account?{" "}
              <button onClick={() => switchTab("signup")} style={{ background: "none", border: "none", color: T.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 }}>
                Registrati gratis
              </button>
            </>
          ) : (
            <>Hai già un account?{" "}
              <button onClick={() => switchTab("login")} style={{ background: "none", border: "none", color: T.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 }}>
                Accedi
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
