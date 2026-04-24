import { ProgramDetailClient } from "@/components/workout/ProgramDetailClient";

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProgramDetailClient id={id} />;
}
