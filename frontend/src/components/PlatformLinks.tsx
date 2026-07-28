type Platform = "twitter" | "tiktok" | "reddit" | "instagram";

const PLATFORMS: { key: Platform; label: string; href: string }[] = [
  { key: "twitter", label: "Twitter / X", href: "/" },
  { key: "tiktok", label: "TikTok", href: "/tiktokvideodownloader" },
  { key: "reddit", label: "Reddit", href: "/redditvideodownloader" },
  { key: "instagram", label: "Instagram", href: "/instagramvideodownloader" },
];

export function PlatformLinks({ active }: { active: Platform }) {
  return (
    <nav className="platform-links" aria-label="Choose a platform">
      {PLATFORMS.map((p) =>
        p.key === active ? (
          <span key={p.key} className="platform-card active" aria-current="page">
            {p.label}
          </span>
        ) : (
          <a key={p.key} className="platform-card" href={p.href}>
            {p.label} downloader
          </a>
        ),
      )}
    </nav>
  );
}
