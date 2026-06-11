import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OneLM — AI case assistant for PI firms",
  description: "The AI case assistant for personal injury firms",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
