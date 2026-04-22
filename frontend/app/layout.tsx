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
  title: "AI Workflow Automation",
  description: "Build and execute AI workflows from a unified dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${sourceCodePro.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <div className="relative min-h-screen">
          <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_35%)]" />

          <div className="mx-auto flex min-h-screen w-full max-w-425 flex-col md:flex-row">
            <AppSidebar />

            <main className="flex-1 px-4 pb-8 pt-6 md:px-8 md:pt-10">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
