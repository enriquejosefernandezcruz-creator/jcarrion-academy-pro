import { useEffect, useState } from "react";

const LS_KEY = "jcap_token_v1";

type Props = {
  children: React.ReactNode;
};

export function getStoredToken(): string {
  try {
    return (localStorage.getItem(LS_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

export default function AccessGate({ children }: Props) {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = getStoredToken();
    if (t) {
      setSaved(true);
    }
  }, []);

  function save() {
    const t = token.trim();
    if (!t) return;
    try {
      localStorage.setItem(LS_KEY, t);
      setSaved(true);
    } catch {
      // sin storage, no puede persistir
      setSaved(false);
    }
  }

  function logout() {
    clearStoredToken();
    setToken("");
    setSaved(false);
    // fuerza rerender de la app
    location.reload();
  }

 if (saved)
  return (
    <>
      <div style={{ position: "absolute", top: 10, right: 10 }}>
        <button
          onClick={logout}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Cerrar sesión
        </button>
      </div>
      {children}
    </>
  );


  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Acceso</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Introduce tu token de acceso. Se guardará en este dispositivo.
      </p>

      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Token
      </label>
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="JCAP-DRV-001-…"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #ccc",
          fontSize: 14,
        }}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <button
        onClick={save}
        style={{
          marginTop: 12,
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: 0,
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Entrar
      </button>

      <p style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Si cambias de móvil o borras datos del navegador, tendrás que introducirlo de nuevo.
      </p>
    </div>
  );
}
