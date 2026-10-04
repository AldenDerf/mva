export default function NewAdminRegistrationLoading() {
  return <main role="status" aria-label="Loading registration form" className="max-w-4xl space-y-5 animate-pulse pb-16">
    <div className="h-11 w-36 rounded-lg bg-[#DDE3DE]" /><div className="h-9 w-64 max-w-full rounded-lg bg-[#DDE3DE]" />
    {[1, 2, 3].map(item => <div key={item} className="space-y-4 rounded-2xl border border-[#DDE3DE] bg-white p-6"><div className="h-6 w-40 rounded bg-[#DDE3DE]" /><div className="grid gap-4 sm:grid-cols-2"><div className="h-11 rounded-lg bg-[#FAFAF8]" /><div className="h-11 rounded-lg bg-[#FAFAF8]" /></div></div>)}
  </main>;
}
