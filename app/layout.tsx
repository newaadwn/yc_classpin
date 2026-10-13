import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/app/_controller/auth-context";
import { LanguageProvider } from "@/app/_controller/language-context";
import { SessionStore } from "@/app/_controller/session-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "OhPin",
  description: "Real-time lecture questions pinned to the exact spot on a slide."
};

// viewport-fit=cover 없이는 env(safe-area-inset-*) 이 늘 0 이라, 노치·홈 인디케이터를 피하려고
// 써 둔 여백이 전부 무시된다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><LanguageProvider><AuthProvider><SessionStore>{children}</SessionStore></AuthProvider></LanguageProvider></body></html>;
}
