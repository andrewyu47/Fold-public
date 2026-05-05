"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FeedbackLink() {
  const path = usePathname();
  const href =
    path && path !== "/feedback"
      ? `/feedback?page=${encodeURIComponent(path)}`
      : "/feedback";
  return (
    <Link href={href} className="chip hover:bg-accent/10">💬 Questions?</Link>
  );
}
