import type { Metadata } from "next";
import { Libre_Baskerville, Playfair_Display, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-masthead",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-serif-accent",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Tailor-Made Newspaper",
  description:
    "Edizione mattutina personale di Alessandro Armiento: meteo, titoli dal mondo e promemoria email su una pagina stampabile.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${playfair.variable} ${sourceSerif.variable} ${libreBaskerville.variable} h-full`}
    >
      <body className="min-h-full font-body antialiased">{children}</body>
    </html>
  );
}
