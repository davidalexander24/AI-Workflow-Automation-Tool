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

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://ai-workflow-automation-tool-production.vercel.app";

const DESCRIPTION =
  "Define prompt blueprints, run them with structured input, and inspect every execution.";

// Open Graph and Twitter tags give the link a preview card when it is shared
// on LinkedIn or in chat. The image comes from app/opengraph-image.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "AI/WFA:~$ workflow runner",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: "/",
    siteName: "AI Workflow Automation Tool",
    title: "AI Workflow Automation Tool",
    description:
      "Reusable prompt templates, run on demand across Google, OpenAI, Alibaba, NVIDIA and Cohere models, with every run logged.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Workflow Automation Tool",
    description: DESCRIPTION,
  },
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
