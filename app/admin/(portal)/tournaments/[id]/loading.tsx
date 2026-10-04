export default function TournamentDetailLoading() {
  return <main role="status" aria-label="Loading tournament operations" className="space-y-5 animate-pulse pb-16">
    <div className="h-11 w-32 rounded-lg bg-[#DDE3DE]" />
    <div className="space-y-4 rounded-2xl border border-[#DDE3DE] bg-white p-6"><div className="h-8 w-64 max-w-full rounded-lg bg-[#DDE3DE]" /><div className="flex flex-wrap gap-3">{[1, 2, 3].map(item => <div key={item} className="h-11 w-36 rounded-lg bg-[#DDE3DE]" />)}</div></div>
    <div className="grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map(item => <div key={item} className="h-24 rounded-xl border border-[#DDE3DE] bg-white" />)}</div>
    <div className="h-48 rounded-2xl border border-[#DDE3DE] bg-white" />
  </main>;
}
