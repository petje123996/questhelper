import type { MetadataRoute } from "next";

// Makes the app installable: "Add to Home screen" opens it
// fullscreen without the browser bar, like a real app.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OSRS Quest Helper",
    short_name: "QuestHelper",
    description: "OSRS Wiki quick guides, right next to your game",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#26211A",
    theme_color: "#26211A",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
