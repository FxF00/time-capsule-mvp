import { createBrowserRouter, RouterProvider, Link, useLocation } from "react-router-dom";
import CreateCapsule from "./pages/CreateCapsule";
import ClaimCapsule from "./pages/ClaimCapsule";

function NavBar() {
  const location = useLocation();
  const isCreate = location.pathname === "/create";

  return (
    <nav
      style={{
        display: "flex",
        gap: "1.5rem",
        padding: "1rem 2rem",
        borderBottom: "1px solid var(--border)",
        marginBottom: "2rem",
      }}
    >
      <Link
        to="/create"
        style={{
          color: isCreate ? "var(--accent)" : "var(--text-muted)",
          fontWeight: isCreate ? 700 : 400,
          textDecoration: "none",
          fontSize: "1rem",
        }}
      >
        Create
      </Link>
      <Link
        to="/claim"
        style={{
          color: !isCreate ? "var(--accent)" : "var(--text-muted)",
          fontWeight: !isCreate ? 700 : 400,
          textDecoration: "none",
          fontSize: "1rem",
        }}
      >
        Claim
      </Link>
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
]);

export default function App() {
  return <RouterProvider router={router} />;
}
