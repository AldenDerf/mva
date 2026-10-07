"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type RowAction = { label: string; href?: string; onSelect?: () => void; destructive?: boolean; disabled?: boolean };
type Position = { left: number; top: number };

const VIEWPORT_PADDING = 8;

export function calculateMenuPosition(
  trigger: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  panel: Pick<DOMRect, "width" | "height">,
  viewport: { width: number; height: number },
): Position {
  const left = Math.min(
    Math.max(VIEWPORT_PADDING, trigger.left),
    Math.max(VIEWPORT_PADDING, viewport.width - panel.width - VIEWPORT_PADDING),
  );
  const below = trigger.bottom + 4;
  const above = trigger.top - panel.height - 4;
  const preferredTop = below + panel.height + VIEWPORT_PADDING <= viewport.height ? below : above;
  const top = Math.min(
    Math.max(VIEWPORT_PADDING, preferredTop),
    Math.max(VIEWPORT_PADDING, viewport.height - panel.height - VIEWPORT_PADDING),
  );
  return { left, top };
}

export function RowActionsMenu({ label, title, subtitle, items = [], children }: {
  label: string;
  title?: string;
  subtitle?: string;
  items?: RowAction[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  function close(restoreFocus = true) {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open || mobile || !panel.current || !trigger.current) return;
    const next = calculateMenuPosition(
      trigger.current.getBoundingClientRect(),
      panel.current.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPosition(next);
  }, [open, mobile]);

  useEffect(() => {
    if (!open) return;
    if (mobile) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previousOverflow; };
    }
  }, [open, mobile]);

  useEffect(() => {
    if (!open) return;
    if (mobile || position) panel.current?.querySelector<HTMLElement>('a, button:not(:disabled)')?.focus();
    const nestedDialogOpen = () => Boolean(panel.current?.querySelector('[role="dialog"]'));
    const outside = (event: PointerEvent) => {
      if (!nestedDialogOpen() && !trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !nestedDialogOpen()) { event.preventDefault(); close(); }
    };
    const anotherMenu = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(false); };
    const viewportChanged = (event: Event) => { if (!panel.current?.contains(event.target as Node) && !nestedDialogOpen()) close(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("mva-row-actions-open", anotherMenu);
    window.addEventListener("scroll", viewportChanged, true);
    window.addEventListener("resize", viewportChanged);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("mva-row-actions-open", anotherMenu);
      window.removeEventListener("scroll", viewportChanged, true);
      window.removeEventListener("resize", viewportChanged);
    };
  }, [open, mobile, position, id]);

  return <div className="inline-block text-left">
    <button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-haspopup={mobile ? "dialog" : "true"} aria-controls={open ? id : undefined}
      onClick={() => {
        if (open) { close(); return; }
        setMobile(window.innerWidth < 640);
        setPosition(null);
        document.dispatchEvent(new CustomEvent("mva-row-actions-open", { detail: id }));
        setOpen(true);
      }}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#DDE3DE] bg-white text-lg font-bold text-[#205823] hover:bg-[#eef5ef] focus-visible:outline-2 focus-visible:outline-[#205823]"
    >⋮</button>
    {open && createPortal(<>
      {mobile && <button type="button" aria-label="Close actions" onClick={() => close()} className="fixed inset-0 z-40 bg-black/30" />}
      <div ref={panel} id={id} role={mobile ? "dialog" : "group"} aria-modal={mobile ? true : undefined} aria-label={label}
        style={mobile ? undefined : { left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
        className={mobile
          ? "fixed inset-x-2 bottom-0 z-50 max-h-[min(70dvh,40rem)] overflow-y-auto rounded-t-2xl border border-[#DDE3DE] bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-xl"
          : "fixed z-50 max-h-[calc(100dvh-16px)] min-w-44 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-[#DDE3DE] bg-white p-1 shadow-lg"}>
        {mobile && (title || subtitle) && <div className="border-b border-[#DDE3DE] px-2 pb-3 pt-1">
          {title && <p className="font-bold text-[#172019]">{title}</p>}
          {subtitle && <p className="text-xs text-[#5F6B61]">{subtitle}</p>}
        </div>}
        {items.map((item, index) => <div key={`${item.label}-${index}`} className={item.destructive ? "mt-1 border-t border-[#DDE3DE] pt-1" : ""}>
          {item.href && !item.disabled ? <Link href={item.href} onClick={() => close(false)} className={`block min-h-11 rounded-lg px-3 py-3 text-sm font-semibold hover:bg-[#FAFAF8] focus-visible:outline-2 focus-visible:outline-[#205823] ${item.destructive ? "text-red-700" : "text-[#172019]"}`}>{item.label}</Link>
            : <button type="button" disabled={item.disabled} onClick={() => { close(false); item.onSelect?.(); }} className={`w-full min-h-11 rounded-lg px-3 py-3 text-left text-sm font-semibold hover:bg-[#FAFAF8] disabled:cursor-not-allowed disabled:opacity-45 ${item.destructive ? "text-red-700" : "text-[#172019]"}`}>{item.label}</button>}
        </div>)}
        {children && <div className="flex flex-col items-stretch">{children}</div>}
      </div>
    </>, document.body)}
  </div>;
}
