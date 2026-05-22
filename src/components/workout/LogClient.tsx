import { Navigate } from "react-router-dom";

export function LogClient({ programId }: { programId: string }) {
  return <Navigate to={`/programs/${programId}`} replace />;
}
