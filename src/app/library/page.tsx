import type { Metadata } from "next";
import { Vault } from "@/components/library/Vault";

export const metadata: Metadata = { title: "Vault — LUMIÈRE" };

export default function LibraryPage() {
  return <Vault />;
}
