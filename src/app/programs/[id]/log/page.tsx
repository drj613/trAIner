import { LogClient } from "@/components/workout/LogClient";

export default async function LogProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LogClient programId={id} />;
}
