import { Navigate, useParams } from "react-router-dom";

export default function ReceiveRedirect() {
  const { founder, capsuleId } = useParams();
  if (!founder || !capsuleId) return <Navigate to="/claim" replace />;
  return <Navigate to={`/claim?founder=${founder}&capsuleId=${capsuleId}`} replace />;
}
