"use client";

import { useRef } from "react";

/**
 * A React-owned wrapper for an embedded player. React renders it with no children; each
 * player creates its own child element inside it (see `mountPoint`), so a cancelled effect
 * run (React Strict Mode runs effects twice in development) can't strand or steal the
 * element the next run needs.
 */
export function useEmbedHost() {
  const wrapRef = useRef<HTMLDivElement>(null);
  return { wrapRef };
}

/** A fresh element inside `wrapper` for an embed API to replace with its iframe. */
export function mountPoint(wrapper: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  wrapper.appendChild(el);
  return el;
}
