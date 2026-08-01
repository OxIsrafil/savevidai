import { enShared } from "../locales/en";
import type { PlatformKey, PlatformLinksStrings } from "../locales/types";

export function PlatformLinks({
  active,
  strings = enShared,
}: {
  active: PlatformKey;
  strings?: PlatformLinksStrings;
}) {
  // Built inside the component on purpose (spec rule): a module-level array
  // would freeze one locale's labels and hrefs at import time, so every page in
  // the process would render whichever table was imported first.
  const { prefix, platform } = strings;
  const home = prefix ? `${prefix}/` : "/";
  const platforms: { key: PlatformKey; label: string; href: string }[] = [
    { key: "twitter", label: platform.twitter, href: home },
    { key: "tiktok", label: platform.tiktok, href: `${prefix}/tiktokvideodownloader` },
    { key: "reddit", label: platform.reddit, href: `${prefix}/redditvideodownloader` },
    { key: "instagram", label: platform.instagram, href: `${prefix}/instagramvideodownloader` },
    { key: "facebook", label: platform.facebook, href: `${prefix}/facebookvideodownloader` },
  ];

  return (
    <nav className="platform-links" aria-label={platform.navLabel}>
      {platforms.map((p) =>
        p.key === active ? (
          <span key={p.key} className="platform-card active" aria-current="page">
            {p.label}
          </span>
        ) : (
          <a key={p.key} className="platform-card" href={p.href}>
            {p.label}
            <span className="sr-only">{platform.srSuffix}</span>
          </a>
        ),
      )}
    </nav>
  );
}
