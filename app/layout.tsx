import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sprout Pilot | Plant watering dashboard",
  description:
    "Monitor soil moisture, local weather, and safe prototype watering from one dashboard.",
  openGraph: {
    title: "Sprout Pilot | Plant watering dashboard",
    description:
      "Monitor soil moisture, weather, and bounded prototype watering from one dashboard.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Basil plant connected to a safe watering prototype and moisture dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#173f35",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
