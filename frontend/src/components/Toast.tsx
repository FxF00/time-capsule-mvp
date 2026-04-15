import { createContext, useContext, useState, useCallback, ReactNode } from "react";

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
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastMessage }) {
  const isSuccess = toast.type === "success";

  return (
    <div className={`toast-item ${isSuccess ? "toast-success" : "toast-error"}`}>
      <div className="toast-title">{toast.title}</div>
      {toast.txHash && (
        <a
          href={`https://polygonscan.com/tx/${toast.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="toast-link"
        >
          View on Polygonscan →
        </a>
      )}
    </div>
  );
}
