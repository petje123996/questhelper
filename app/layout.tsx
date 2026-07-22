import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "OSRS Quest Helper",
  description: "OSRS Wiki quick guides, right next to your game",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "QuestHelper",
  },
};

export const viewport: Viewport = {
  themeColor: "#26211A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#26211A" }}>{children}</body>
    </html>
  );
}
