import { Navigate } from "react-router-dom";

// C14: LogClient had unbound inputs that saved zero values.
// Redirect to /today where logging actually works.
export function LogClient(_props: { programId: string }) {
  return <Navigate to="/today" replace />;
}
