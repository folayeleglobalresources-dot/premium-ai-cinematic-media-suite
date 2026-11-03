import { Editor } from "@/components/editor/Editor";

export const metadata = { title: "Sequence — Obsidian" };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Editor timelineId={Number(id)} />;
}
