import { ProgramMapClient } from "@/components/workout/ProgramMapClient";

export default async function ProgramMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProgramMapClient programId={id} />;
}
