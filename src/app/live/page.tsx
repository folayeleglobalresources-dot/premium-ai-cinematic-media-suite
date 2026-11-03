import type { Metadata } from "next";
import { BroadcastStudio } from "@/components/live/BroadcastStudio";

export const metadata: Metadata = { title: "Broadcast — LUMIÈRE" };

export default function LivePage() {
  return <BroadcastStudio />;
}
