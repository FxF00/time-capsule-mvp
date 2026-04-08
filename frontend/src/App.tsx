import { createBrowserRouter, RouterProvider, Link, useLocation } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import CreateCapsule from "./pages/CreateCapsule";
import ClaimCapsule from "./pages/ClaimCapsule";
import ReceiveCapsule from "./pages/ReceiveCapsule";
import History from "./pages/History";
import MyCapsules from "./pages/MyCapsules";
import { NetworkProvider, useNetwork } from "./contexts/NetworkContext";

function NetworkIndicator() {
  const { network } = useNetwork();

  const dotColor =
    network.status === "mainnet"
      ? "#22c55e"
      : network.status === "testnet"
      ? "#eab308"
      : network.status === "localhost"
      ? "#9ca3af"
      : "#6b7280";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: dotColor,
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{network.name}</span>
    </div>
  );
}

function NavBar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      style={{
        display: "flex",
        gap: "1.5rem",
        padding: "1rem 2rem",
        borderBottom: "1px solid var(--border)",
        marginBottom: "2rem",
        alignItems: "center",
      }}
    >
      <Link
        to="/create"
        style={{
          color: isActive("/create") ? "var(--accent)" : "var(--text-muted)",
          fontWeight: isActive("/create") ? 700 : 400,
          textDecoration: "none",
          fontSize: "1rem",
        }}
      >
        Create
      </Link>
      <Link
        to="/claim"
        style={{
          color: isActive("/claim") ? "var(--accent)" : "var(--text-muted)",
          fontWeight: isActive("/claim") ? 700 : 400,
          textDecoration: "none",
          fontSize: "1rem",
        }}
      >
        Claim
      </Link>
      <Link
        to="/history"
        style={{
          color: isActive("/history") ? "var(--accent)" : "var(--text-muted)",
          fontWeight: isActive("/history") ? 700 : 400,
          textDecoration: "none",
          fontSize: "1rem",
        }}
      >
        History
      </Link>
      <Link
        to="/mycapsules"
        style={{
          color: isActive("/mycapsules") ? "var(--accent)" : "var(--text-muted)",
          fontWeight: isActive("/mycapsules") ? 700 : 400,
          textDecoration: "none",
          fontSize: "1rem",
        }}
      >
        My Capsules
      </Link>
      <NetworkIndicator />
    </nav>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <div>
        <NavBar />
        <CreateCapsule />
      </div>
    ),
  },
  {
    path: "/create",
    element: (
      <div>
        <NavBar />
        <CreateCapsule />
      </div>
    ),
  },
  {
    path: "/claim",
    element: (
      <div>
        <NavBar />
        <ClaimCapsule />
      </div>
    ),
  },
  {
    path: "/receive/:founder/:capsuleId",
    element: <ReceiveCapsule />,
  },
  {
    path: "/history",
    element: (
      <div>
        <NavBar />
        <History />
      </div>
    ),
  },
  {
    path: "/mycapsules",
    element: (
      <div>
        <NavBar />
        <MyCapsules />
      </div>
    ),
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
