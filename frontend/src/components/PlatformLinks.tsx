type Platform = "twitter" | "tiktok";

const PLATFORMS: { key: Platform; label: string; href: string }[] = [
  { key: "twitter", label: "Twitter / X", href: "/" },
  { key: "tiktok", label: "TikTok", href: "/tiktokvideodownloader" },
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
