import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminRegistrationChoices } from "@/lib/admin/registration-create";
import { AdminRegistrationForm } from "@/components/admin/AdminRegistrationForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Register Team | MVA Admin" };

export default async function NewAdminRegistrationPage() {
  await requireAdmin();
  const choices = await getAdminRegistrationChoices();
  return <main className="space-y-5 pb-16">
    <Link href="/admin/registrations" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#205823]">← Registrations</Link>
    <div><p className="text-xs font-bold uppercase tracking-wider text-[#A47415]">Admin Registration</p>
      <h1 className="mt-1 text-3xl font-extrabold text-[#205823]">Register a Team</h1>
      <p className="mt-1 text-sm text-[#5F6B61]">Add a team and its roster to a tournament division.</p></div>
    <AdminRegistrationForm choices={choices} />
  </main>;
}
