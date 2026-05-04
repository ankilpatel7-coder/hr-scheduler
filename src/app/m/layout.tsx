/**
 * Mobile shell — minimal layout for PWA-installed app.
 * No desktop navbar; just full-screen mobile-optimized routes.
 */

export const metadata = {
  title: "Shiftwork",
  manifest: "/manifest.json",
  themeColor: "#6366f1",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default" as const,
    title: "Shiftwork",
  },
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {children}
    </div>
  );
}
