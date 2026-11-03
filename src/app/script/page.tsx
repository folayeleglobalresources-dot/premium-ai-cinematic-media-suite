import type { Metadata } from "next";
import { WritersRoom } from "@/components/script/WritersRoom";

export const metadata: Metadata = { title: "Writers' Room — LUMIÈRE" };

export default function ScriptPage() {
  return <WritersRoom />;
}
