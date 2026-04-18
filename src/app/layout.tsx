import type { Metadata } from "next";
import { Libre_Baskerville, Playfair_Display, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const libreBaskerville = Libre_Baskerville({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--f-logo",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--f-display",
  display: "swap",
});

const dmSans = DM_Sans({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--f-body",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--f-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "André Gutto",
  description:
    "Finanças reais e os bastidores de quem escolheu construir uma vida diferente — fora do Brasil.",
  openGraph: {
    title: "André Gutto",
    description:
      "Finanças reais e os bastidores de quem escolheu construir uma vida diferente — fora do Brasil.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${libreBaskerville.variable} ${playfairDisplay.variable} ${dmSans.variable} ${dmMono.variable}`}
    >
      <head>
        <meta name="color-scheme" content="light only" />
      </head>
      <body>{children}</body>
    </html>
  );
}
