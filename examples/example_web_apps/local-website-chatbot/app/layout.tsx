import "./globals.css";
import { Public_Sans } from "next/font/google";

import { Navbar } from "@/components/Navbar";

const publicSans = Public_Sans({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Fully In-Browser Chat Over Documents</title>
        <link rel="shortcut icon" href="/images/favicon.ico" />
        <meta
          name="description"
          content="Upload a PDF, then ask questions about it - without a single remote request!"
        />
        <meta
          property="og:title"
          content="Fully In-Browser Chat Over Documents"
        />
        <meta
          property="og:description"
          content="Upload a PDF, then ask questions about it - without a single remote request!"
        />
        <meta property="og:image" content="/images/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Fully In-Browser Chat Over Documents"
        />
        <meta
          name="twitter:description"
          content="Upload a PDF, then ask questions about it - without a single remote request!"
        />
        <meta name="twitter:image" content="/images/og-image.png" />
      </head>
      <body className={publicSans.className}>
        <div className="flex flex-col p-4 md:p-12 h-[100vh]">{children}</div>
      </body>
    </html>
  );
}
