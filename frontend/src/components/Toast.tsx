import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export type ToastType = "success" | "error";

export interface ToastMessage {
  id: number;
  type: ToastType;
  title: string;
  txHash?: string;
}

interface ToastContextValue {
  toasts: ToastMessage[];
  showToast: (type: ToastType, title: string, txHash?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastType, title: string, txHash?: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, title, txHash }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastContainer({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastMessage }) {
  const isSuccess = toast.type === "success";
  const bg = isSuccess ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
  const borderColor = isSuccess ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)";

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: "10px",
        padding: "0.875rem 1.25rem",
        color: "#fff",
        minWidth: "280px",
        maxWidth: "380px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        pointerEvents: "auto",
        animation: "toastIn 0.25s ease-out",
      }}
    >
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: toast.txHash ? "0.4rem" : 0 }}>
        {toast.title}
      </div>
      {toast.txHash && (
        <a
          href={`https://polygonscan.com/tx/${toast.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "rgba(255,255,255,0.85)",
            fontSize: "0.75rem",
            fontFamily: "monospace",
            textDecoration: "underline",
          }}
        >
          View on Polygonscan →
        </a>
      )}
    </div>
  );
}
