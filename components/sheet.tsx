"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/** Ignore backdrop taps right after opening, so the tap that opened the sheet can't close it. */
const OPEN_GRACE_MS = 350;

/** Bottom sheet dialog. Closes on backdrop tap and Escape; returns focus on close. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const openedAt = useRef(0);
  const downOnBackdrop = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openedAt.current = performance.now();
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button, a[href]");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const fromBackdrop = e.target === e.currentTarget && downOnBackdrop.current;
        downOnBackdrop.current = false;
        if (fromBackdrop && performance.now() - openedAt.current > OPEN_GRACE_MS) closeRef.current();
      }}
    >
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 id={titleId} className="sheet-title display">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
