/**
 * Annotated "how to download" process graphic for the hero's empty space.
 * Inline SVG on purpose: it inherits the design-token CSS variables, so the
 * mock UI recolors itself in light/dark, and the red marker annotations stay
 * crisp at any DPI. Landscape flow on sm+ screens; the stacked variant shows
 * only on phones where a wide composite would scale below legibility.
 * Purely decorative-instructional; the crawlable text version lives in the
 * static landing section below.
 */

const RED = "#ff5148";

export function TikTokHowToVisual() {
  return (
    <figure className="mt-14 w-full lg:-mx-24 lg:w-[calc(100%+12rem)]">
      <Landscape />
      <Stacked />
      <figcaption className="sr-only">
        Copy the post link, paste it above, pick a quality, and the video saves with a clean
        filename.
      </figcaption>
    </figure>
  );
}

function Landscape() {
  return (
    <svg
      viewBox="0 0 1360 452"
      role="img"
      aria-label="How to download: copy the post link from TikTok, paste it in the box, then pick a quality to save the video"
      className="hidden h-auto w-full sm:block"
    >
      {/* ── Step 1: post mock with Copy link menu ── */}
      <g>
        <rect x="24" y="40" width="400" height="400" rx="22" fill="var(--card)" stroke="var(--line)" />
        <circle cx="64" cy="86" r="17" fill="var(--pill)" />
        <rect x="96" y="72" width="110" height="11" rx="5.5" fill="var(--pill)" />
        <rect x="96" y="91" width="72" height="9" rx="4.5" fill="var(--pill)" />
        {/* thumbnail */}
        <rect x="48" y="124" width="280" height="170" rx="14" fill="var(--pill)" />
        <circle cx="188" cy="209" r="27" fill="var(--accent)" opacity="0.9" />
        <path d="M180 195 L203 209 L180 223 Z" fill="#fff" />
        {/* share menu card */}
        <rect x="288" y="300" width="136" height="92" rx="14" fill="var(--card)" stroke="var(--line)" />
        <path d="M306 328 a7 7 0 1 1 6 3 l-4 6 a7 7 0 1 1 -6 -3 Z" fill="none" stroke="var(--fg)" strokeWidth="2.4" />
        <text x="326" y="334" fontFamily="var(--font-sans)" fontSize="16.5" fontWeight="600" fill="var(--fg)">
          Copy link
        </text>
        <rect x="306" y="356" width="86" height="9" rx="4.5" fill="var(--pill)" />
        {/* red marker: wobbly circle around Copy link + badge 1 */}
        <path
          d="M296 310 C330 298 420 300 428 322 C436 346 400 354 354 353 C312 352 288 342 291 327 C293 317 306 310 324 308"
          fill="none"
          stroke={RED}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.95"
        />
        <circle cx="52" cy="64" r="16" fill={RED} />
        <text x="52" y="70" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="18" fontWeight="700" fill="#fff">
          1
        </text>
      </g>

      {/* red arrow: menu → paste pill */}
      <path
        d="M436 326 C474 316 494 284 506 252"
        fill="none"
        stroke={RED}
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path d="M488 254 L508 248 L502 270" fill="none" stroke={RED} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />

      {/* ── Step 2: paste pill + Fetch ── */}
      <g>
        <rect x="505" y="210" width="300" height="58" rx="29" fill="var(--card)" stroke="var(--line)" />
        <text x="533" y="246" fontFamily="var(--font-mono)" fontSize="17" fill="var(--muted)">
          tiktok.com/@user/vid…
        </text>
        <rect x="815" y="210" width="118" height="58" rx="29" fill="var(--accent)" />
        <text x="874" y="246" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="18.5" fontWeight="600" fill="#fff">
          Fetch
        </text>
        {/* red marker circle around the whole row + badge 2 */}
        <path
          d="M512 204 C600 186 900 188 948 216 C966 244 900 280 800 282 C660 286 490 282 484 246 C481 226 510 208 560 200"
          fill="none"
          stroke={RED}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.95"
        />
        <circle cx="505" cy="170" r="16" fill={RED} />
        <text x="505" y="176" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="18" fontWeight="700" fill="#fff">
          2
        </text>
      </g>

      {/* red arrow: paste → qualities */}
      <path
        d="M960 240 C978 240 986 240 1000 240"
        fill="none"
        stroke={RED}
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path d="M984 224 L1004 240 L984 256" fill="none" stroke={RED} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />

      {/* ── Step 3: quality pills + saved file ── */}
      <g>
        <rect x="1010" y="56" width="326" height="386" rx="22" fill="var(--card)" stroke="var(--line)" />
        {/* best quality pill (primary) */}
        <rect x="1040" y="96" width="246" height="56" rx="28" fill="var(--accent)" />
        <text x="1062" y="131" fontFamily="var(--font-sans)" fontSize="19" fontWeight="700" fill="#fff">
          hd
        </text>
        <rect x="1170" y="106" width="36" height="22" rx="11" fill="#ffffff" opacity="0.24" />
        <text x="1188" y="122" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12" fontWeight="800" fill="#fff">
          HD
        </text>
        {/* secondary pill */}
        <rect x="1040" y="166" width="218" height="52" rx="26" fill="var(--pill)" stroke="var(--line)" />
        <text x="1062" y="199" fontFamily="var(--font-sans)" fontSize="17" fontWeight="600" fill="var(--fg)">
          sd
        </text>
        {/* saved row */}
        <line x1="1040" y1="312" x2="1306" y2="312" stroke="var(--line)" />
        <circle cx="1058" cy="352" r="16" fill="#34c759" />
        <path d="M1050 352 L1056 359 L1067 345" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <text x="1086" y="349" fontFamily="var(--font-mono)" fontSize="14.5" fill="var(--fg)">
          user_123_hd.mp4
        </text>
        <text x="1086" y="370" fontFamily="var(--font-sans)" fontSize="13.5" fill="var(--muted)">
          saved to your device
        </text>
        <text x="1040" y="416" fontFamily="var(--font-sans)" fontSize="13.5" fill="var(--faint)">
          No watermark. Straight from the source.
        </text>
        {/* red marker circle around best pill + badge 3 */}
        <path
          d="M1046 88 C1120 72 1290 76 1300 106 C1308 134 1260 160 1170 162 C1090 164 1022 154 1022 124 C1022 106 1046 92 1090 86"
          fill="none"
          stroke={RED}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.95"
        />
        <circle cx="1030" cy="66" r="16" fill={RED} />
        <text x="1030" y="72" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="18" fontWeight="700" fill="#fff">
          3
        </text>
      </g>
    </svg>
  );
}

/* Phone-only stacked variant: same three steps flowing top to bottom. */
function Stacked() {
  return (
    <svg
      viewBox="0 0 560 992"
      role="img"
      aria-label="How to download: copy the post link from TikTok, paste it in the box, then pick a quality to save the video"
      className="h-auto w-full sm:hidden"
    >
      <g>
        <rect x="24" y="22" width="512" height="272" rx="22" fill="var(--card)" stroke="var(--line)" />
        <circle cx="72" cy="70" r="17" fill="var(--pill)" />
        <rect x="102" y="56" width="110" height="11" rx="5.5" fill="var(--pill)" />
        <rect x="102" y="75" width="72" height="9" rx="4.5" fill="var(--pill)" />
        <rect x="48" y="106" width="330" height="160" rx="14" fill="var(--pill)" />
        <circle cx="213" cy="186" r="27" fill="var(--accent)" opacity="0.9" />
        <path d="M205 172 L228 186 L205 200 Z" fill="#fff" />
        <rect x="396" y="120" width="136" height="92" rx="14" fill="var(--card)" stroke="var(--line)" />
        <path d="M414 148 a7 7 0 1 1 6 3 l-4 6 a7 7 0 1 1 -6 -3 Z" fill="none" stroke="var(--fg)" strokeWidth="2.4" />
        <text x="434" y="153" fontFamily="var(--font-sans)" fontSize="16.5" fontWeight="600" fill="var(--fg)">
          Copy link
        </text>
        <rect x="414" y="176" width="86" height="9" rx="4.5" fill="var(--pill)" />
        <path
          d="M405 128 C438 116 528 118 536 140 C544 164 508 172 462 171 C420 170 396 160 399 145 C401 135 414 128 432 126"
          fill="none"
          stroke={RED}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.95"
        />
        <circle cx="52" cy="46" r="16" fill={RED} />
        <text x="52" y="52" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="18" fontWeight="700" fill="#fff">
          1
        </text>
      </g>

      <path
        d="M470 186 C462 232 400 250 320 268 C286 276 268 292 264 314"
        fill="none"
        stroke={RED}
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path d="M252 296 L264 318 L279 300" fill="none" stroke={RED} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />

      <g>
        <rect x="24" y="348" width="380" height="58" rx="29" fill="var(--card)" stroke="var(--line)" />
        <text x="52" y="384" fontFamily="var(--font-mono)" fontSize="17" fill="var(--muted)">
          tiktok.com/@user/vid…
        </text>
        <rect x="416" y="348" width="120" height="58" rx="29" fill="var(--accent)" />
        <text x="476" y="384" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="18.5" fontWeight="600" fill="#fff">
          Fetch
        </text>
        <path
          d="M30 342 C130 322 480 324 544 352 C566 378 520 416 420 418 C260 424 20 420 12 384 C8 362 40 346 96 338"
          fill="none"
          stroke={RED}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.95"
        />
        <circle cx="52" cy="330" r="16" fill={RED} />
        <text x="52" y="336" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="18" fontWeight="700" fill="#fff">
          2
        </text>
      </g>

      <path
        d="M296 428 C304 462 296 484 284 506"
        fill="none"
        stroke={RED}
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path d="M272 490 L282 510 L298 496" fill="none" stroke={RED} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />

      <g>
        <rect x="24" y="532" width="512" height="452" rx="22" fill="var(--card)" stroke="var(--line)" />
        <rect x="56" y="568" width="268" height="60" rx="30" fill="var(--accent)" />
        <text x="86" y="606" fontFamily="var(--font-sans)" fontSize="20" fontWeight="700" fill="#fff">
          hd
        </text>
        <rect x="204" y="580" width="38" height="24" rx="12" fill="#ffffff" opacity="0.24" />
        <text x="223" y="597" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="13" fontWeight="800" fill="#fff">
          HD
        </text>
        <rect x="56" y="646" width="240" height="56" rx="28" fill="var(--pill)" stroke="var(--line)" />
        <text x="86" y="681" fontFamily="var(--font-sans)" fontSize="18" fontWeight="600" fill="var(--fg)">
          sd
        </text>
        <line x1="56" y1="812" x2="504" y2="812" stroke="var(--line)" />
        <circle cx="78" cy="862" r="17" fill="#34c759" />
        <path d="M70 862 L76 869 L87 855" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <text x="106" y="859" fontFamily="var(--font-mono)" fontSize="15.5" fill="var(--fg)">
          user_123_hd.mp4
        </text>
        <text x="106" y="881" fontFamily="var(--font-sans)" fontSize="14.5" fill="var(--muted)">
          saved to your device
        </text>
        <text x="56" y="946" fontFamily="var(--font-sans)" fontSize="15" fill="var(--faint)">
          No watermark. Straight from the source.
        </text>
        <path
          d="M50 560 C140 542 330 546 342 580 C352 612 300 640 200 642 C120 644 36 634 34 602 C33 582 60 566 110 558"
          fill="none"
          stroke={RED}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.95"
        />
        <circle cx="52" cy="540" r="16" fill={RED} />
        <text x="52" y="546" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="18" fontWeight="700" fill="#fff">
          3
        </text>
      </g>
    </svg>
  );
}
