import { useState, useEffect } from "react";
import { createBrowserRouter, RouterProvider, Link, useLocation } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import CreateCapsule from "./pages/CreateCapsule";
import ClaimCapsule from "./pages/ClaimCapsule";
import ReceiveRedirect from "./pages/ReceiveRedirect";
import History from "./pages/History";
import { NetworkProvider, useNetwork } from "./contexts/NetworkContext";

/* ── Network indicator ── */
function NetworkIndicator() {
  const { network } = useNetwork();

  const dotClass =
    network.status === "mainnet"
      ? "network-dot network-dot-mainnet"
      : network.status === "testnet"
      ? "network-dot network-dot-testnet"
      : network.status === "localhost"
      ? "network-dot network-dot-localhost"
      : "network-dot network-dot-unknown";

  return (
    <div className="navbar-network">
      <span className={dotClass} />
      <span className="text-xs tracking-wide" style={{ letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)" }}>
        {network.name}
      </span>
    </div>
  );
}

/* ── Live UTC clock ── */
function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = String(time.getHours()).padStart(2, "0");
  const m = String(time.getMinutes()).padStart(2, "0");
  const s = String(time.getSeconds()).padStart(2, "0");
  return <span className="navbar-clock">{h}:{m}:{s}</span>;
}

/* ── Time Capsule Icon ──
   Capsule pill + clock hands — evokes time locking */
function TimeCapsuleBrand() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <radialGradient id="brand-bg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#232338" />
          <stop offset="100%" stopColor="#0a0a18" />
        </radialGradient>
        <linearGradient id="brand-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#c8c8c8" />
          <stop offset="55%" stopColor="#e8e8e8" />
          <stop offset="80%" stopColor="#888888" />
          <stop offset="100%" stopColor="#d0d0d0" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#brand-bg)" />
      <circle cx="16" cy="16" r="13" fill="none" stroke="url(#brand-chrome)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="url(#brand-chrome)" strokeWidth="1" />
      <circle cx="16" cy="16" r="2.5" fill="url(#brand-chrome)" />
      <line x1="16" y1="7" x2="16" y2="10" stroke="url(#brand-chrome)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="22" x2="16" y2="25" stroke="url(#brand-chrome)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="16" x2="10" y2="16" stroke="url(#brand-chrome)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="16" x2="25" y2="16" stroke="url(#brand-chrome)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Navbar ── */
function NavBar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="navbar">
      {/* Brand */}
      <Link to="/create" className="navbar-brand">
        <TimeCapsuleBrand />
        <div className="navbar-brand-text">
          <span className="navbar-brand-name">TIME CAPSULE</span>
        </div>
      </Link>

      <div className="navbar-sep" />

      {/* Nav links */}
      <div className="navbar-links">
        {[
          { path: "/create", label: "Create" },
          { path: "/claim", label: "Claim" },
          { path: "/history", label: "History" },
        ].map(({ path, label }, idx) => (
          <div key={path} style={{ display: "flex", alignItems: "center" }}>
            {idx > 0 && (
              <div
                style={{
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "var(--border)",
                  margin: "0 0.5rem",
                  opacity: 0.6,
                }}
              />
            )}
            <Link
              to={path}
              className={`navbar-link ${isActive(path) ? "navbar-link-active" : ""}`}
            >
              {label}
            </Link>
          </div>
        ))}
      </div>

      <div className="navbar-spacer" />

      {/* Live UTC clock */}
      <LiveClock />

      {/* Network status */}
      <NetworkIndicator />
    </nav>
  );
}


function BackgroundFX() {
  return (
    <svg
      className="bg-fx"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* Chrome gradient — vertical bands */}
        <linearGradient id="fx-chrome-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="25%"  stopColor="#c0c0c8" stopOpacity="0.7" />
          <stop offset="50%"  stopColor="#e8e8f0" stopOpacity="0.9" />
          <stop offset="75%"  stopColor="#888898" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#d0d0dc" stopOpacity="0.8" />
        </linearGradient>
        {/* Chrome gradient — diagonal sweep */}
        <linearGradient id="fx-chrome-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#b0b8c8" stopOpacity="0.6" />
          <stop offset="40%"  stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="70%"  stopColor="#c8d0dc" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#8898b0" stopOpacity="0.5" />
        </linearGradient>
        {/* Capsule pill gradient */}
        <linearGradient id="fx-pill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#a8a8b8" stopOpacity="0.4" />
          <stop offset="50%"  stopColor="#e0e0ec" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#a8a8b8" stopOpacity="0.4" />
        </linearGradient>

        {/* Vault ring filter */}
        <filter id="fx-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComponentTransfer in="blur" result="glow">
            <feFuncA type="linear" slope="2.5" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="fx-glow-soft" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComponentTransfer in="blur" result="glow">
            <feFuncA type="linear" slope="1.8" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Large vault ring — top-right ── */}
      <g className="fx-vault-tr" opacity="0.55" filter="url(#fx-glow)">
        <circle cx="88%" cy="-90" r="330" fill="none" stroke="url(#fx-chrome-v)" strokeWidth="1.8" />
        <circle cx="88%" cy="-90" r="255" fill="none" stroke="url(#fx-chrome-v)" strokeWidth="1.2" />
        <circle cx="88%" cy="-90" r="165" fill="none" stroke="url(#fx-chrome-d)" strokeWidth="0.9" />
        <line x1="calc(88% - 330)" y1="-90" x2="calc(88% - 300)" y2="-90" stroke="url(#fx-chrome-v)" strokeWidth="3" strokeLinecap="round" />
        <line x1="calc(88% + 300)" y1="-90" x2="calc(88% + 330)" y2="-90" stroke="url(#fx-chrome-v)" strokeWidth="3" strokeLinecap="round" />
        <line x1="88%" y1="-420" x2="88%" y2="-390" stroke="url(#fx-chrome-v)" strokeWidth="3" strokeLinecap="round" />
        <line x1="88%" y1="210" x2="88%" y2="240" stroke="url(#fx-chrome-v)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="88%" cy="-90" r="12" fill="url(#fx-chrome-d)" />
      </g>

      {/* ── Large vault ring — bottom-left ── */}
      <g className="fx-vault-bl" opacity="0.45" filter="url(#fx-glow)">
        <circle cx="12%" cy="110%" r="390" fill="none" stroke="url(#fx-chrome-v)" strokeWidth="1.8" />
        <circle cx="12%" cy="110%" r="300" fill="none" stroke="url(#fx-chrome-d)" strokeWidth="1.2" />
        <circle cx="12%" cy="110%" r="195" fill="none" stroke="url(#fx-chrome-v)" strokeWidth="0.9" />
        <line x1="12%" y1="calc(110% - 390)" x2="12%" y2="calc(110% - 360)" stroke="url(#fx-chrome-v)" strokeWidth="3" strokeLinecap="round" />
        <line x1="12%" y1="calc(110% + 360)" x2="12%" y2="calc(110% + 390)" stroke="url(#fx-chrome-v)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="12%" cy="110%" r="15" fill="url(#fx-chrome-d)" />
      </g>

      {/* ── Floating capsule pills ── */}
      <rect className="fx-pill-1" x="8%" y="30%" width="90" height="33" rx="16" fill="none" stroke="url(#fx-pill)" strokeWidth="1.8" filter="url(#fx-glow-soft)" opacity="0.55" />
      <rect className="fx-pill-2" x="78%" y="55%" width="120" height="39" rx="19" fill="none" stroke="url(#fx-pill)" strokeWidth="1.8" filter="url(#fx-glow-soft)" opacity="0.50" />
      <rect className="fx-pill-3" x="55%" y="15%" width="72" height="27" rx="13" fill="none" stroke="url(#fx-pill)" strokeWidth="1.5" filter="url(#fx-glow-soft)" opacity="0.45" />
      <rect className="fx-pill-4" x="22%" y="72%" width="105" height="36" rx="18" fill="none" stroke="url(#fx-pill)" strokeWidth="1.8" filter="url(#fx-glow-soft)" opacity="0.50" />

      {/* ── Flowing liquid metal lines ── */}
      <path className="fx-stream-1" d="M-100,35% Q20%,32% 50%,38% T120%,36%" fill="none" stroke="url(#fx-chrome-d)" strokeWidth="1.8" filter="url(#fx-glow-soft)" opacity="0.45" />
      <path className="fx-stream-2" d="M-100,65% Q30%,60% 60%,68% T120%,64%" fill="none" stroke="url(#fx-chrome-d)" strokeWidth="1.5" filter="url(#fx-glow-soft)" opacity="0.40" />

      {/* ── Clock tick marks — center background ── */}
      <g className="fx-clock" opacity="0.35" filter="url(#fx-glow)" transform="translate(50%, 50%)">
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const r1 = 210, r2 = i % 3 === 0 ? 232 : 222;
          return (
            <line
              key={i}
              x1={Math.sin(angle) * r1}
              y1={-Math.cos(angle) * r1}
              x2={Math.sin(angle) * r2}
              y2={-Math.cos(angle) * r2}
              stroke="url(#fx-chrome-v)"
              strokeWidth={i % 3 === 0 ? "1.8" : "1.0"}
              strokeLinecap="round"
            />
          );
        })}
        <circle r="218" fill="none" stroke="url(#fx-chrome-v)" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <BackgroundFX />
      {children}
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <PageShell><NavBar /><CreateCapsule /></PageShell>,
  },
  {
    path: "/create",
    element: <PageShell><NavBar /><CreateCapsule /></PageShell>,
  },
  {
    path: "/claim",
    element: <PageShell><NavBar /><ClaimCapsule /></PageShell>,
  },
  {
    path: "/receive/:founder/:capsuleId",
    element: <ReceiveRedirect />,
  },
  {
    path: "/history",
    element: <PageShell><NavBar /><History /></PageShell>,
  },
]);

export default function App() {
  return (
    <ToastProvider>
      <NetworkProvider>
        <RouterProvider router={router} />
      </NetworkProvider>
    </ToastProvider>
  );
}
