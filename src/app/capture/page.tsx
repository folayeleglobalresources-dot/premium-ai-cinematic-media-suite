import type { Metadata } from "next";
import { CaptureStudio } from "@/components/capture/CaptureStudio";

export const metadata: Metadata = { title: "Capture — LUMIÈRE" };

export default function CapturePage() {
  return <CaptureStudio />;
}
