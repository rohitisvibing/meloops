"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, LibraryIcon, PlusIcon, ProfileIcon, SharedIcon } from "./icons";

const LINKS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/create", label: "Add song", Icon: PlusIcon },
  { href: "/shared", label: "Shared", Icon: SharedIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
];

export function BottomNav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav-inner">
        {LINKS.map(({ href, label, Icon }) =>
          href === "/create" ? (
            <Link key={href} href={href} className="nav-create" aria-label={label} aria-current={isActive(href) ? "page" : undefined}>
              <PlusIcon size={28} strokeWidth={2.8} />
            </Link>
          ) : (
            <Link key={href} href={href} className="nav-link" aria-current={isActive(href) ? "page" : undefined}>
              <Icon size={22} />
              {label}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
