import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "OSRS Quest Helper",
  description: "Quick guides van de OSRS Wiki, naast je spel",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
