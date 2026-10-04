import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { getDivision, getTournament } from "@/lib/admin/tournaments";
import { DivisionForm } from "@/components/admin/DivisionForm";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function EditDivisionPage({ params }: { params: Promise<{ id: string; divisionId: string }> }) {
  await requireAdmin();
  const { id, divisionId } = await params;
  if (!uuid.test(id) || !uuid.test(divisionId)) notFound();
  const [tournament, division] = await Promise.all([getTournament(id), getDivision(id, divisionId)]);
  if (!tournament || !division) notFound();
  return <main className="space-y-5 pb-16">
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[#205823]">
      <Link href="/admin/tournaments" className="inline-flex min-h-11 items-center">Tournaments</Link><span aria-hidden="true">›</span>
      <Link href={`/admin/tournaments/${id}`} className="inline-flex min-h-11 items-center">{tournament.name}</Link><span aria-hidden="true">›</span><span>Edit {division.name}</span>
    </nav>
    <div><h1 className="text-3xl font-extrabold text-[#205823]">Edit Division</h1>
      <p className="mt-1 text-sm text-[#5F6B61]">Update {division.name} in {tournament.name}.</p></div>
    <DivisionForm tournamentId={id} initial={division} />
  </main>;
}
