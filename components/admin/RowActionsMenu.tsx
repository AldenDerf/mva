"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type RowAction = { label: string; href?: string; onSelect?: () => void; destructive?: boolean; disabled?: boolean };

export function RowActionsMenu({ label, items = [], children }: { label: string; items?: RowAction[]; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button:not(:disabled)')?.focus();
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); } };
    const closeOther = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) setOpen(false); };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    document.addEventListener("mva-row-actions-open", closeOther);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); document.removeEventListener("mva-row-actions-open", closeOther); window.removeEventListener("scroll", closeOnScroll, true); window.removeEventListener("resize", closeOnScroll); };
  }, [open, id]);
  return <div ref={root} className="relative inline-block text-left">
    <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => { if (!open) { const rect = root.current!.getBoundingClientRect(); setPosition({ top: rect.bottom + 220 > window.innerHeight ? Math.max(8, rect.top - 220) : rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) }); document.dispatchEvent(new CustomEvent("mva-row-actions-open", { detail: id })); } setOpen(!open); }} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[#DDE3DE] bg-white text-lg font-bold text-[#205823] hover:bg-[#eef5ef] focus-visible:outline-2 focus-visible:outline-[#205823]">⋮</button>
    {open && createPortal(<div ref={panel} id={id} style={position} className="fixed z-50 min-w-44 rounded-xl border border-[#DDE3DE] bg-white p-1 shadow-xl">
      {items.map((item, index) => <div key={`${item.label}-${index}`} className={item.destructive ? "border-t border-[#DDE3DE] pt-1 mt-1" : ""}>
        {item.href && !item.disabled ? <Link href={item.href} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#FAFAF8] focus-visible:outline-2 focus-visible:outline-[#205823] ${item.destructive ? "text-red-700" : "text-[#172019]"}`}>{item.label}</Link>
          : <button type="button" disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect?.(); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#FAFAF8] disabled:cursor-not-allowed disabled:opacity-45 ${item.destructive ? "text-red-700" : "text-[#172019]"}`}>{item.label}</button>}
      </div>)}
      {children && <div className="flex flex-col items-start gap-1 p-1">{children}</div>}
    </div>, document.body)}
  </div>;
}
