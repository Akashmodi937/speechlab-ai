import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SpeechLab AI", description: "Speech testing and transcript evaluation workspace" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
