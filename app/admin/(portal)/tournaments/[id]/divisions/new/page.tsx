import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { getTournament } from "@/lib/admin/tournaments";
import { DivisionForm } from "@/components/admin/DivisionForm";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function NewDivisionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const tournament = await getTournament(id);
  if (!tournament) notFound();
  return <main className="space-y-5 pb-16">
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[#205823]">
      <Link href="/admin/tournaments" className="inline-flex min-h-11 items-center">Tournaments</Link><span aria-hidden="true">›</span>
      <Link href={`/admin/tournaments/${id}`} className="inline-flex min-h-11 items-center">{tournament.name}</Link><span aria-hidden="true">›</span><span>Add Division</span>
    </nav>
    <div><h1 className="text-3xl font-extrabold text-[#205823]">Add Division</h1>
      <p className="mt-1 text-sm text-[#5F6B61]">Configure a division for {tournament.name}.</p></div>
    <DivisionForm tournamentId={id} />
  </main>;
}
