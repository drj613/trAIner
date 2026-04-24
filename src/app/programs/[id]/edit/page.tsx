import { EditClient } from "@/components/workout/EditClient";

export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditClient programId={id} />;
}
