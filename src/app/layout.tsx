import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";
import { ThemeScript } from "../components/ThemeScript";
import { Tooltips } from "../components/Tooltips";
import "./globals.css";

export const metadata: Metadata = {
  title: "Charticulum",
  description: "Chart your curriculum. See how it all fits together.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script adds a "dark" class to <html> before React loads,
    // so React would otherwise warn that the class differs from the server's.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased">
        {children}
        {/* Draws the label for anything with a data-tooltip, on every page. */}
        <Tooltips />
      </body>
    </html>
  );
}
