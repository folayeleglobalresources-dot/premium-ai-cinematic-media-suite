import { redirect } from "next/navigation";

// The integrated AI Director works against the active Montage timeline.
export default function DirectorPage() {
  redirect("/editor?director=1");
}
