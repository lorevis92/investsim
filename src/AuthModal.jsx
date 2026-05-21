import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const T = {
  bg: "#F9FAFB", surface: "#FFFFFF", border: "#E5E7EB",
  text: "#111827", textSecondary: "#6B7280", textMuted: "#9CA3AF",
  blue: "#2563EB", blueLight: "#EFF6FF", blueBorder: "#BFDBFE",
  red: "#DC2626", redLight: "#FEF2F2",
};

function Field({ label, type, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 6 }}>
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
          border: `1.5px solid ${T.border}`, borderRadius: 10,
          padding: "10px 14px", fontSize: 15, color: T.text,
          background: T.bg, outline: "none", fontFamily: "inherit",
        }}
        onFocus={(e) => { e.target.style.borderColor = T.blue; }}
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

  // Reset form and apply defaultTab every time the modal opens
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
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div style={{
        background: T.surface, borderRadius: 18,
        padding: "28px 24px", width: "100%", maxWidth: 400,
        boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: T.blue }}>WisiInvest</span>
          <button
            onClick={close}
            style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 2 }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", background: T.bg,
          borderRadius: 10, padding: 3, marginBottom: 22,
        }}>
          {[["login", "Accedi"], ["signup", "Registrati"]].map(([t, label]) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                flex: 1, padding: "8px 0", border: "none",
                borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                background: tab === t ? T.surface : "transparent",
                color: tab === t ? T.text : T.textMuted,
                boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
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
              background: T.redLight, border: "1px solid #FECACA",
              borderRadius: 8, padding: "10px 14px",
              color: T.red, fontSize: 13, marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", background: loading ? T.textMuted : T.blue,
              color: "#fff", border: "none", borderRadius: 10,
              padding: "13px 0", fontWeight: 600, fontSize: 15,
              cursor: loading ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {loading ? "Un attimo…" : tab === "login" ? "Accedi" : "Crea account gratuito"}
          </button>
        </form>

        {/* Switch link */}
        <p style={{ textAlign: "center", fontSize: 13, color: T.textSecondary, marginTop: 16, marginBottom: 0 }}>
          {tab === "login" ? (
            <>Non hai un account?{" "}
              <button onClick={() => switchTab("signup")} style={{ background: "none", border: "none", color: T.blue, fontWeight: 600, cursor: "pointer", fontSize: 13, padding: 0 }}>
                Registrati gratis
              </button>
            </>
          ) : (
            <>Hai già un account?{" "}
              <button onClick={() => switchTab("login")} style={{ background: "none", border: "none", color: T.blue, fontWeight: 600, cursor: "pointer", fontSize: 13, padding: 0 }}>
                Accedi
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
