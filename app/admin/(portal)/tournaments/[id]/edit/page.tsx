import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { getTournament } from "@/lib/admin/tournaments";
import { TournamentForm } from "@/components/admin/TournamentForm";

export const dynamic = "force-dynamic";
export default async function EditTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const tournament = await getTournament(id);
  if (!tournament) notFound();
  return <main className="space-y-5 pb-16"><Link href={`/admin/tournaments/${id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#205823]">← {tournament.name}</Link>
    <h1 className="text-3xl font-extrabold text-[#205823]">Edit Tournament</h1><TournamentForm initial={tournament} /></main>;
}
