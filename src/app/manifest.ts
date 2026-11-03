import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LUMIÈRE — Premium AI Cinematic Media Suite",
    short_name: "LUMIÈRE",
    description: "Capture, broadcast, edit, grade and deliver cinema from any computer.",
    start_url: "/",
    display: "standalone",
    background_color: "#070708",
    theme_color: "#070708",
    orientation: "any",
    categories: ["photo", "video", "productivity", "entertainment"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
