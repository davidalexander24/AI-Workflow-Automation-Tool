import type { Metadata } from "next";
import { Space_Grotesk, Source_Code_Pro } from "next/font/google";
import { AppSidebar } from "./ui/app-sidebar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI/WFA:~$ workflow runner",
  description:
    "Define prompt blueprints, run them with structured input, and inspect every execution.",
};

const themePrePaintScript = `(function(){try{var t=localStorage.getItem('wfa-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.setAttribute('data-theme','dark');}}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${spaceGrotesk.variable} ${sourceCodePro.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themePrePaintScript }} />
      </head>
      <body className="min-h-screen text-ink antialiased">
        <div className="flex min-h-screen w-full flex-col md:flex-row">
          <AppSidebar />
          <main className="flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
