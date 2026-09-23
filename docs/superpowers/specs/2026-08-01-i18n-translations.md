# i18n translations reference: es + hi (2026-08-01)

Companion to `2026-08-01-i18n-design.md`. This file is the SINGLE SOURCE OF TRUTH
for every user-visible es/hi string. Implementer tasks COPY FROM HERE VERBATIM;
reviews check character fidelity against this doc, not against a fresh translation.
If a string is wrong, fix it HERE first, then in code.

Conventions used below:
- `{n}` marks a runtime interpolation. It must survive translation, in a position
  that is grammatical for the target language (Hindi in particular reorders).
- "JSON-LD" tags the four FAQ entries per page that are ALSO emitted in the
  FAQPage script. The subset invariant is per locale: the JSON-LD text must be a
  character-exact copy of the visible `<summary>`/`<p>` twin in the SAME locale.
- Anything in `code font` is a literal token that stays identical in all three
  locales: `mp4`, `HD`, `SD`, `GIF`, `720p`, `1080p`, `480p`, `CDN`, `1920×1080`,
  `34 MB`, filenames, URLs, `@israfill`, `© 2026 SaveVid AI`.

---

## 1. Register rules

### Both locales (hard rules)

- NO em dashes anywhere. Use hyphen, comma, colon, period. This includes the
  title separator: keep the existing ` - ` hyphen form.
- NO emoji. The `▶` glyph in the example chip is existing UI, not an emoji swap.
- Brand name **SaveVid AI** is never translated, never transliterated, never
  declined. In Hindi it takes postpositions normally: "SaveVid AI को", "SaveVid AI से".
- Platform names stay canonical Latin script in ALL locales: Twitter/X, TikTok,
  Reddit, Instagram, Facebook. Do NOT write टिकटॉक / रेडिट / इंस्टाग्राम / फ़ेसबुक.
- Honesty constraints carry over exactly:
  - No watermark claim on Reddit, Instagram, or Facebook. Twitter and TikTok
    keep their existing claims.
  - Legality answers stay HEDGED. Never a flat verdict: never "es legal",
    never "कानूनी है" as a bare assertion. The required shape is
    **a hedge + a responsibility clause**, not one fixed sentence.
    Hedges: es "en general no hay problema" / "en general no da problemas";
    hi "आम तौर पर ठीक रहता है". Responsibility clauses: es
    "tú eres responsable de lo que hagas con lo que guardas" or
    "usa con responsabilidad lo que descargues"; hi
    "जो सेव करें उसका इस्तेमाल आपकी ज़िम्मेदारी है" or
    "जो डाउनलोड करें, उसे ज़िम्मेदारी से इस्तेमाल करें".
    The Twitter Q4 variant uses the second form of each: that is compliant.
  - iOS wording preserved: the Files app + the share sheet, both named.
    es "la app Archivos" + "la hoja para compartir"; hi "Files ऐप" + "शेयर शीट".
  - No click counts (2026-09-23): the follow popup makes a save two clicks, so
    no string in any locale says how many clicks a download takes.
- Owner voice: direct, human, short sentences, no corporate filler. No
  "nuestra plataforma", no "experiencia de usuario", no "आपके अनुभव को बेहतर".

### es: neutral Latin American Spanish

- **tú-form throughout. No vosotros, ever.** Imperatives are tú: pega, elige,
  copia, guarda, usa, revisa, muévelo. Never pegad/elegid, never pegue/elija.
- LatAm lexicon: **video** (no accent, never "vídeo"), **celular** (not "móvil"),
  **enlace** (not "link"), **computadora/laptop** (not "ordenador"),
  **descarga/descargar**, **archivo**, **carpeta de Descargas**.
- "post" is kept as-is: it is the live word across MX/AR/CL/CO for social posts
  and matches how users search. "reel" likewise (Instagram/Facebook's own term).
- Inverted punctuation is mandatory: ¿ and ¡. All accents present:
  á é í ó ú ñ ü. (Build gate: verify the Onest subset's unicode-range covers
  these plus ¿ ¡; extend the subset if it does not.)
- Sentence case in headings, matching the English page. No Title Case.

### hi: standard Hindi in Devanagari

- Script is Devanagari. Nukta forms used where standard: फ़ाइल, फ़ोटो, ज़्यादा,
  सिर्फ़, तेज़, फ़ॉर्मैट, फ़्री.
- **Register is the neutral-polite आप imperative (करें / चुनें / पेस्ट करें).**
  This is the Hindi equivalent of the English page's direct-but-friendly voice;
  तुम/तू would read as rude in an app, and the honorific कीजिए would read as
  stiff. Consistent across all 5 pages.
- Loanwords stay loanwords, in Devanagari transliteration, because that is what
  Indian app UI actually does and what Devanagari-reading users search for:
  डाउनलोड, वीडियो, लिंक, पेस्ट, कॉपी, सेव, क्वालिटी, फ़ाइल, फ़ोटो, ऑडियो, रील,
  ब्राउज़र, सर्वर, प्राइवेट, पब्लिक, लॉगिन, अकाउंट, स्लाइडशो, कैरोसेल, ओरिजिनल,
  वॉटरमार्क, रीडायरेक्ट, प्रीव्यू, डिवाइस, फ़ोल्डर, विज्ञापन (native, preferred
  over "ऐड"), क्रिएटर, कम्युनिटी, कन्वर्ज़न, नेटवर्क, कनेक्शन.
- Stays in LATIN script (do not transliterate): platform names, product names
  shown in the OS UI (Safari, Files, Photos, Android, iPhone, Share, Copy link),
  format/quality tokens (`mp4`, `HD`, `SD`, `GIF`, `720p`), domains, filenames.
  Rationale: users see these strings in Latin script on their own device; a
  Devanagari "सफ़ारी" would be a worse instruction, not a better one.
- Sentence terminator is the danda `।` in prose. Question marks stay `?`.
  Colons stay `:`.
- Hindi is head-final: "X डाउनलोडर", "पोस्ट का लिंक". Where the English markup
  puts a label before a suffix (footer credit, sr-only suffixes), the SHELL is
  hand-authored per locale, so reorder the HTML nodes rather than forcing
  English word order into Hindi.

---

## 2. Shared UI strings

Every literal below is rendered by shared React code (or by the shared parts of
all five shells) and is identical across pages. Per-page strings live in section 3.

### 2.1 Nav pill and brand

| key | en | es | hi |
| --- | --- | --- | --- |
| `nav.brand` | SaveVid AI | SaveVid AI | SaveVid AI |
| `nav.twitter` | Twitter/X | Twitter/X | Twitter/X |
| `nav.tiktok` | TikTok | TikTok | TikTok |
| `nav.reddit` | Reddit | Reddit | Reddit |
| `nav.instagram` | Instagram | Instagram | Instagram |
| `nav.facebook` | Facebook | Facebook | Facebook |
| `nav.downloadButton` | Download | Descargar | डाउनलोड |

### 2.2 Theme toggle (aria-label only, no visible text)

| key | en | es | hi |
| --- | --- | --- | --- |
| `theme.toLight` | Switch to light mode | Cambiar a modo claro | लाइट मोड पर जाएँ |
| `theme.toDark` | Switch to dark mode | Cambiar a modo oscuro | डार्क मोड पर जाएँ |

### 2.3 Paste input button states

Placeholder and aria-label are per-page: see section 3.

| key | en | es | hi |
| --- | --- | --- | --- |
| `input.submit` | Fetch | Buscar | पाएँ |
| `input.fetched` | Fetched | Listo | मिल गया |

The busy state renders a spinner with no text in all locales.

### 2.4 Hero chips

Which chips appear on which page: see the per-page chip lists in section 3.

| key | en | es | hi |
| --- | --- | --- | --- |
| `chip.example` | ▶ try an example | ▶ prueba un ejemplo | ▶ एक उदाहरण देखें |
| `chip.noLogin` | no login | sin registro | कोई लॉगिन नहीं |
| `chip.noWatermark` | no watermark | sin marca de agua | कोई वॉटरमार्क नहीं |
| `chip.originalQuality` | original quality | calidad original | ओरिजिनल क्वालिटी |
| `chip.withAudio` | with audio | con audio | ऑडियो के साथ |
| `chip.hdQuality` | hd quality | calidad hd | HD क्वालिटी |
| `chip.publicOnly` | public posts only | solo posts públicos | सिर्फ़ पब्लिक पोस्ट |

### 2.5 PlatformLinks

`platform.srSuffix` is the `<span class="sr-only">` appended after the label, so a
screen reader reads label + suffix as one phrase. The es form is deliberately
"para descargar videos" rather than a bare "descargador": Spanish is head-initial,
so "TikTok descargador" would be ungrammatical while "TikTok para descargar videos"
is natural. Hindi is head-final, so the bare " डाउनलोडर" suffix works as-is.

| key | en | es | hi |
| --- | --- | --- | --- |
| `platform.navLabel` (aria) | Choose a platform | Elige una plataforma | प्लेटफ़ॉर्म चुनें |
| `platform.twitter` | Twitter / X | Twitter / X | Twitter / X |
| `platform.tiktok` | TikTok | TikTok | TikTok |
| `platform.reddit` | Reddit | Reddit | Reddit |
| `platform.instagram` | Instagram | Instagram | Instagram |
| `platform.facebook` | Facebook | Facebook | Facebook |
| `platform.srSuffix` (leading space) | ` downloader` | ` para descargar videos` | ` डाउनलोडर` |

Hrefs are locale-prefixed by the strings table (`/es/tiktokvideodownloader` etc.);
the home link is `/es/` and `/hi/`. Analytics `platform` values stay canonical
English and are NOT translated.

### 2.6 PreviewCard

| key | en | es | hi |
| --- | --- | --- | --- |
| `preview.videoSingle` (aria) | Video | Video | वीडियो |
| `preview.videoN` (aria + h3) | Video {n} | Video {n} | वीडियो {n} |
| `preview.gifBadge` | GIF | GIF | GIF |

The author name, handle, post text, duration badge and file sizes are API data or
numbers: never translated.

### 2.7 QualityButton

| key | en | es | hi |
| --- | --- | --- | --- |
| `quality.saved` | Saved | Guardado | सेव हो गया |
| `quality.downloading` | downloading | descargando | डाउनलोड जारी |
| `quality.retry` | retry | reintentar | दोबारा |
| `quality.hdChip` | HD | HD | HD |

The resolution label (`1280×720`) and byte size stay as rendered.

### 2.8 PhotoGrid

| key | en | es | hi |
| --- | --- | --- | --- |
| `photos.sectionLabel` (aria) | Photos | Fotos | फ़ोटो |
| `photos.saveAll` | Save all | Guardar todas | सब सेव करें |
| `photos.sound` | Sound | Audio | ऑडियो |
| `photos.soundSaved` | Sound saved | Audio guardado | ऑडियो सेव हो गया |
| `photos.soundRetry` | Retry sound | Reintentar audio | ऑडियो दोबारा |
| `photos.savePhotoN` (aria) | Save photo {n} | Guardar foto {n} | फ़ोटो {n} सेव करें |

### 2.9 SkeletonCard

No user-visible text (shimmer blocks only). Nothing to translate; listed so the
inventory sweep can mark it checked.

### 2.11 Client-minted error strings

These three are minted in the browser (`useResolve.ts`, `lib/api.ts`) and MUST be
translated. The backend `body.message` passthrough stays English in v1: that is a
separate backend errors-i18n task, out of scope here, and it is stated honestly
rather than papered over.

| key | en | es | hi |
| --- | --- | --- | --- |
| `error.network` | Network error. Check your connection and try again. | Error de red. Revisa tu conexión e inténtalo de nuevo. | नेटवर्क एरर। अपना कनेक्शन जाँचें और दोबारा कोशिश करें। |
| `error.serverUnreachable` | Can't reach the SaveVid server right now. Try again in a moment. | No podemos conectar con el servidor de SaveVid ahora mismo. Inténtalo en un momento. | अभी SaveVid सर्वर से कनेक्ट नहीं हो पा रहा। थोड़ी देर में दोबारा कोशिश करें। |
| `error.generic` | Something went wrong. Try again. | Algo salió mal. Inténtalo de nuevo. | कुछ गड़बड़ हो गई। दोबारा कोशिश करें। |

### 2.12 Language switcher (new, on all 15 shells)

Autonyms are IDENTICAL on every shell in every locale: a Hindi reader looking for
Hindi must see हिन्दी, not "Hindi", no matter which page they landed on.

| key | en | es | hi |
| --- | --- | --- | --- |
| `lang.navLabel` (aria) | Language | Idioma | भाषा |
| `lang.en` (autonym) | English | English | English |
| `lang.es` (autonym) | Español | Español | Español |
| `lang.hi` (autonym) | हिन्दी | हिन्दी | हिन्दी |

Each autonym links to the same slug in its locale: `/`, `/es/`, `/hi/` on the
Twitter page; `/tiktokvideodownloader`, `/es/tiktokvideodownloader`,
`/hi/tiktokvideodownloader` on TikTok, and so on.

### 2.13 Shell section headers (identical on all five pages)

| key | en | es | hi |
| --- | --- | --- | --- |
| `section.howItWorksKicker` | how it works | cómo funciona | यह कैसे काम करता है |
| `section.howItWorksTitle` | Three steps, no accounts | Tres pasos, sin cuentas | तीन स्टेप, कोई अकाउंट नहीं |
| `section.questionsKicker` | questions | preguntas | सवाल |
| `section.faqTitle` | Frequently asked questions | Preguntas frecuentes | अक्सर पूछे जाने वाले सवाल |

### 2.14 Footer (shared parts)

`footer.builtBy` is the text node before the `@israfill` link. Hindi needs the
name FIRST, so the hi shell renders the link then the text:
`<a ...>@israfill</a> ने बनाया`. es keeps English order: `hecho por <a>@israfill</a>`.

| key | en | es | hi |
| --- | --- | --- | --- |
| `footer.brand` | SaveVid AI | SaveVid AI | SaveVid AI |
| `footer.linksLabel` (aria) | SaveVid AI links | Enlaces de SaveVid AI | SaveVid AI लिंक |
| `footer.platformsLabel` (aria) | All downloaders | Todos los descargadores | सभी डाउनलोडर |
| `footer.xLink` | X · @israfill | X · @israfill | X · @israfill |
| `footer.builtBy` | built by | hecho por | ने बनाया (node order flipped, see above) |
| `footer.copyright` | © 2026 SaveVid AI | © 2026 SaveVid AI | © 2026 SaveVid AI |

### 2.15 Footer platform anchor texts (the static crawl path)

These are the anchor texts in the `All downloaders` nav on every shell. They
double as the locale's primary internal-link anchors, so the es forms are the
verb-first phrasing Spanish speakers actually search
("descargar videos de tiktok"), not a calque of the English noun phrase.

| key | en | es | hi |
| --- | --- | --- | --- |
| `footerNav.twitter` | Twitter/X video downloader | Descargar videos de Twitter/X | Twitter/X वीडियो डाउनलोडर |
| `footerNav.tiktok` | TikTok video downloader | Descargar videos de TikTok | TikTok वीडियो डाउनलोडर |
| `footerNav.reddit` | Reddit video downloader | Descargar videos de Reddit | Reddit वीडियो डाउनलोडर |
| `footerNav.instagram` | Instagram reel downloader | Descargar reels de Instagram | Instagram रील डाउनलोडर |
| `footerNav.facebook` | Facebook video downloader | Descargar videos de Facebook | Facebook वीडियो डाउनलोडर |

Total shared rows: **61** (excluding the SkeletonCard no-op note, which has no strings).

---

## 3. Per-page strings

Structure per page: meta title, meta description, og/twitter description, hero h1
(two-part split preserved), lede, input placeholder, input aria-label, hero note,
chips, three how-it-works steps, footer description, then every visible FAQ entry.

The hero h1 keeps its two spans: `<span class="word">A</span>` +
`<span class="word grey small">B</span>`. For **es** the split is
"Descargar videos" + "de <Platform>": that keeps the phrase grammatical and the
full keyword intact while preserving the visual weight split. For **hi** the split
maps 1:1 onto English because Hindi is head-final: "<Platform> वीडियो" + "डाउनलोडर".

---

### 3.1 Twitter/X (`/`, `/es/`, `/hi/`)

**meta title**
- en: `Twitter/X Video Downloader - Free, Fast, Instant | SaveVid AI`
- es: `Descargar videos de Twitter/X - Gratis, rápido, al instante | SaveVid AI`
- hi: `Twitter/X वीडियो डाउनलोडर - फ़्री, तेज़, तुरंत | SaveVid AI`

**meta description**
- en: Download Twitter/X videos and GIFs in original quality. No fake download buttons, no forced redirects. Free and instant.
- es: Descarga videos y GIFs de Twitter/X en calidad original. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.
- hi: Twitter/X के वीडियो और GIF ओरिजिनल क्वालिटी में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।

**og:description + twitter:description** (same string, both tags)
- en: Paste a post link, pick a quality, done. No fake buttons.
- es: Pega el enlace del post, elige una calidad, listo. Sin botones falsos.
- hi: पोस्ट का लिंक पेस्ट करें, क्वालिटी चुनें, हो गया। कोई नकली बटन नहीं।

**hero h1** (part A + part B)
- en: `Twitter/X Video` + `Downloader`
- es: `Descargar videos` + `de Twitter/X`
- hi: `Twitter/X वीडियो` + `डाउनलोडर`

**lede**
- en: Paste tweet URL and get the video in 2 seconds.
- es: Pega la URL del tweet y obtén el video en 2 segundos.
- hi: ट्वीट का URL पेस्ट करें और 2 सेकंड में वीडियो पाएँ।

**input placeholder**
- en: Paste a Twitter/X post link
- es: Pega el enlace de un post de Twitter/X
- hi: Twitter/X पोस्ट का लिंक पेस्ट करें

**input aria-label**
- en: Twitter/X post link
- es: Enlace de un post de Twitter/X
- hi: Twitter/X पोस्ट का लिंक

**hero note**
- en: Straight from Twitter's CDN. No fake buttons.
- es: Directo desde el CDN de Twitter. Sin botones falsos.
- hi: सीधे Twitter के CDN से। कोई नकली बटन नहीं।

**chips**: `chip.example`, `chip.noLogin`, `chip.noWatermark`, `chip.originalQuality`

**footer description**
- en: Twitter/X video downloader. No fake buttons. One paste, every quality.
- es: Descargador de videos de Twitter/X. Sin botones falsos. Pegas una vez, todas las calidades.
- hi: Twitter/X वीडियो डाउनलोडर। कोई नकली बटन नहीं। एक पेस्ट, हर क्वालिटी।

#### How it works

**Step 1 heading**
- en: Copy the post link
- es: Copia el enlace del post
- hi: पोस्ट का लिंक कॉपी करें

**Step 1 body**
- en: On the post with the video, tap Share, then Copy link. Works with x.com, twitter.com, and mirror links from Discord.
- es: En el post con el video, toca Compartir y luego Copiar enlace. Funciona con x.com, twitter.com y los enlaces espejo de Discord.
- hi: जिस पोस्ट में वीडियो है, उस पर Share दबाएँ, फिर Copy link। x.com, twitter.com और Discord के मिरर लिंक, सब चलते हैं।

**Step 2 heading**
- en: Paste it above
- es: Pégalo arriba
- hi: उसे ऊपर पेस्ट करें

**Step 2 body**
- en: The preview appears in about a second, with every available quality and its file size listed.
- es: La vista previa aparece en un segundo, con todas las calidades disponibles y el tamaño de cada archivo.
- hi: करीब एक सेकंड में प्रीव्यू आ जाता है, हर उपलब्ध क्वालिटी और उसकी फ़ाइल साइज़ के साथ।

**Step 3 heading**
- en: Pick a size
- es: Elige un tamaño
- hi: साइज़ चुनें

**Step 3 body**
- en: The video saves straight from Twitter's CDN to your device with a clean filename. No watermark, ever.
- es: El video se guarda en tu dispositivo directo desde el CDN de Twitter, con un nombre de archivo limpio. Sin marca de agua, nunca.
- hi: वीडियो सीधे Twitter के CDN से आपके डिवाइस में सेव होता है, साफ़ फ़ाइल नाम के साथ। वॉटरमार्क कभी नहीं।

#### FAQ (7 entries; entries 1-4 are JSON-LD mirrored)

**Q1 [JSON-LD]**
- en Q: Is SaveVid AI really free and safe?
- es Q: ¿SaveVid AI es de verdad gratis y seguro?
- hi Q: क्या SaveVid AI सच में फ़्री और सुरक्षित है?
- en A: Yes. No fake download buttons and no forced redirects.
- es A: Sí. Sin botones de descarga falsos ni redirecciones forzadas.
- hi A: हाँ। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं।

**Q2 [JSON-LD]**
- en Q: What quality do I get?
- es Q: ¿Qué calidad obtengo?
- hi Q: मुझे कौन-सी क्वालिटी मिलती है?
- en A: Every quality Twitter serves, up to the original upload resolution, often 720p or 1080p. All options are listed with file sizes; you choose.
- es A: Todas las que entrega Twitter, hasta la resolución original de la subida, muchas veces 720p o 1080p. Todas las opciones aparecen con su tamaño de archivo; tú eliges.
- hi A: हर वह क्वालिटी जो Twitter देता है, ओरिजिनल अपलोड रेज़ोल्यूशन तक, अक्सर 720p या 1080p। सारे विकल्प फ़ाइल साइज़ के साथ दिखते हैं; चुनाव आपका।

**Q3 [JSON-LD]**
- en Q: Do private or age-restricted posts work?
- es Q: ¿Funcionan los posts privados o con restricción de edad?
- hi Q: क्या प्राइवेट या उम्र-प्रतिबंधित पोस्ट चलती हैं?
- en A: No. SaveVid AI only works with public posts, and we would rather say that plainly than pretend otherwise.
- es A: No. SaveVid AI solo funciona con posts públicos, y preferimos decirlo claro antes que fingir lo contrario.
- hi A: नहीं। SaveVid AI सिर्फ़ पब्लिक पोस्ट पर काम करता है, और हम बहाने बनाने के बजाय यह साफ़-साफ़ कहना बेहतर समझते हैं।

**Q4 [JSON-LD]** (hedged legality: no flat verdict in any locale)
- en Q: Is it legal to download Twitter videos?
- es Q: ¿Es legal descargar videos de Twitter?
- hi Q: क्या Twitter के वीडियो डाउनलोड करना कानूनी है?
- en A: Personal use, like archiving your own posts, is generally fine. Reposting someone else's work without permission can infringe copyright. Use downloads responsibly.
- es A: El uso personal, como archivar tus propios posts, en general no da problemas. Volver a publicar el trabajo de otra persona sin permiso puede infringir derechos de autor. Usa con responsabilidad lo que descargues.
- hi A: निजी इस्तेमाल, जैसे अपनी ही पोस्ट सहेजना, आम तौर पर ठीक रहता है। किसी और का काम बिना इजाज़त दोबारा पोस्ट करना कॉपीराइट का उल्लंघन हो सकता है। जो डाउनलोड करें, उसे ज़िम्मेदारी से इस्तेमाल करें।

**Q5**
- en Q: What format do Twitter videos download in?
- es Q: ¿En qué formato se descargan los videos de Twitter?
- hi Q: Twitter के वीडियो किस फ़ॉर्मैट में डाउनलोड होते हैं?
- en A: Always mp4, the format Twitter serves natively. It plays everywhere: phones, laptops, editors, no conversion needed.
- es A: Siempre mp4, el formato que Twitter entrega de forma nativa. Se reproduce en todos lados: celulares, laptops, editores, sin convertir nada.
- hi A: हमेशा mp4, वही फ़ॉर्मैट जो Twitter खुद देता है। यह हर जगह चलता है: फ़ोन, लैपटॉप, एडिटर, बिना किसी कन्वर्ज़न के।

**Q6** (iOS Files app + share sheet wording preserved)
- en Q: How do I save a Twitter video on iPhone or Android?
- es Q: ¿Cómo guardo un video de Twitter en iPhone o Android?
- hi Q: iPhone या Android पर Twitter का वीडियो कैसे सेव करें?
- en A: Paste the link and tap your quality on either. On iPhone, Safari puts the file in the Files app; use the share sheet to move it to Photos. On Android it lands in your Downloads folder.
- es A: En los dos: pega el enlace y toca la calidad que quieras. En iPhone, Safari deja el archivo en la app Archivos; usa la hoja para compartir para moverlo a Fotos. En Android cae en tu carpeta de Descargas.
- hi A: दोनों पर: लिंक पेस्ट करें और अपनी क्वालिटी पर टैप करें। iPhone पर Safari फ़ाइल को Files ऐप में रखता है; शेयर शीट से उसे Photos में ले जाएँ। Android पर वह आपके Downloads फ़ोल्डर में आती है।

**Q7**
- en Q: Who runs this?
- es Q: ¿Quién está detrás de esto?
- hi Q: इसे कौन चलाता है?
- en A: SaveVid AI is built by @israfill.
- es A: SaveVid AI está hecho por @israfill.
- hi A: SaveVid AI को @israfill ने बनाया है।

---

### 3.2 TikTok (`/tiktokvideodownloader`, `/es/...`, `/hi/...`)

**meta title**
- en: `TikTok Video Downloader - No Watermark, Free | SaveVid AI`
- es: `Descargar videos de TikTok sin marca de agua - Gratis | SaveVid AI`
- hi: `TikTok वीडियो डाउनलोडर - बिना वॉटरमार्क, फ़्री | SaveVid AI`

**meta description**
- en: Download TikTok videos without the watermark, in original quality. No fake download buttons, no forced redirects. Free and instant.
- es: Descarga videos de TikTok sin la marca de agua, en calidad original. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.
- hi: TikTok वीडियो बिना वॉटरमार्क, ओरिजिनल क्वालिटी में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।

**og:description + twitter:description**
- en: Paste a TikTok link, get it without the watermark, in seconds. No fake buttons.
- es: Pega un enlace de TikTok y obtén el video sin marca de agua, en segundos. Sin botones falsos.
- hi: TikTok का लिंक पेस्ट करें, कुछ ही सेकंड में बिना वॉटरमार्क वीडियो पाएँ। कोई नकली बटन नहीं।

**hero h1**
- en: `TikTok Video` + `Downloader`
- es: `Descargar videos` + `de TikTok`
- hi: `TikTok वीडियो` + `डाउनलोडर`

**lede**
- en: Paste a TikTok link, get it without the watermark, in seconds.
- es: Pega un enlace de TikTok y obtén el video sin marca de agua, en segundos.
- hi: TikTok का लिंक पेस्ट करें और कुछ ही सेकंड में बिना वॉटरमार्क वीडियो पाएँ।

**input placeholder**
- en: Paste a TikTok video link
- es: Pega el enlace de un video de TikTok
- hi: TikTok वीडियो का लिंक पेस्ट करें

**input aria-label**
- en: TikTok video link
- es: Enlace de un video de TikTok
- hi: TikTok वीडियो का लिंक

**hero note**
- en: Clean file, no watermark. No fake buttons.
- es: Archivo limpio, sin marca de agua. Sin botones falsos.
- hi: साफ़ फ़ाइल, कोई वॉटरमार्क नहीं। कोई नकली बटन नहीं।

**chips**: `chip.example`, `chip.noLogin`, `chip.noWatermark`, `chip.originalQuality`

**footer description**
- en: TikTok video downloader. No fake buttons. One paste, no watermark.
- es: Descargador de videos de TikTok. Sin botones falsos. Pegas una vez, sin marca de agua.
- hi: TikTok वीडियो डाउनलोडर। कोई नकली बटन नहीं। एक पेस्ट, कोई वॉटरमार्क नहीं।

#### How it works

**Step 1 heading**
- en: Open the TikTok post
- es: Abre el post de TikTok
- hi: TikTok पोस्ट खोलें

**Step 1 body**
- en: On the video you want, tap Share, then Copy link. Works with tiktok.com links and the short vm.tiktok.com share links.
- es: En el video que quieres, toca Compartir y luego Copiar enlace. Funciona con los enlaces de tiktok.com y los cortos de vm.tiktok.com.
- hi: जो वीडियो चाहिए, उस पर Share दबाएँ, फिर Copy link। tiktok.com के लिंक और छोटे vm.tiktok.com शेयर लिंक, दोनों चलते हैं।

**Step 2 heading**
- en: Paste it above
- es: Pégalo arriba
- hi: उसे ऊपर पेस्ट करें

**Step 2 body**
- en: The preview appears in about a second, with the video ready to save.
- es: La vista previa aparece en un segundo, con el video listo para guardar.
- hi: करीब एक सेकंड में प्रीव्यू आ जाता है, वीडियो सेव करने के लिए तैयार।

**Step 3 heading**
- en: Download
- es: Descarga
- hi: डाउनलोड करें

**Step 3 body**
- en: The video saves straight to your device with a clean filename. No watermark, ever.
- es: El video se guarda directo en tu dispositivo con un nombre de archivo limpio. Sin marca de agua, nunca.
- hi: वीडियो सीधे आपके डिवाइस में सेव होता है, साफ़ फ़ाइल नाम के साथ। वॉटरमार्क कभी नहीं।

#### FAQ (8 entries; entries 1-4 are JSON-LD mirrored)

**Q1 [JSON-LD]**
- en Q: Do I get the TikTok video without the watermark?
- es Q: ¿El video de TikTok viene sin la marca de agua?
- hi Q: क्या TikTok वीडियो बिना वॉटरमार्क मिलता है?
- en A: Yes. SaveVid AI saves TikTok videos without the watermark, straight from the source, so you get a clean file with no overlay.
- es A: Sí. SaveVid AI guarda los videos de TikTok sin la marca de agua, directo desde la fuente, así que obtienes un archivo limpio, sin nada encima.
- hi A: हाँ। SaveVid AI TikTok वीडियो सीधे सोर्स से, बिना वॉटरमार्क सेव करता है, तो फ़ाइल पूरी साफ़ मिलती है, ऊपर कोई ओवरले नहीं।

**Q2 [JSON-LD]**
- en Q: Is the TikTok downloader really free?
- es Q: ¿El descargador de TikTok es de verdad gratis?
- hi Q: क्या TikTok डाउनलोडर सच में फ़्री है?
- en A: Yes. No fake download buttons and no forced redirects.
- es A: Sí. Sin botones de descarga falsos ni redirecciones forzadas.
- hi A: हाँ। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं।

**Q3 [JSON-LD]**
- en Q: Can I download TikTok photo slideshows?
- es Q: ¿Puedo descargar las presentaciones de fotos de TikTok?
- hi Q: क्या मैं TikTok के फ़ोटो स्लाइडशो डाउनलोड कर सकता हूँ?
- en A: Yes. Photo slideshows resolve to a photo grid: save any photo, save them all in one tap, or grab the soundtrack as an audio file. Your browser may ask once to allow multiple downloads.
- es A: Sí. Las presentaciones de fotos se abren como una cuadrícula: guarda cualquier foto, guárdalas todas con un solo toque o llévate la música como archivo de audio. Tu navegador puede pedirte una vez que permitas varias descargas.
- hi A: हाँ। फ़ोटो स्लाइडशो एक फ़ोटो ग्रिड की तरह खुलते हैं: कोई भी एक फ़ोटो सेव करें, एक टैप में सारी सेव करें, या साउंडट्रैक को ऑडियो फ़ाइल की तरह ले लें। आपका ब्राउज़र एक बार कई डाउनलोड की इजाज़त माँग सकता है।

**Q4 [JSON-LD]**
- en Q: Is it safe to use SaveVid AI for TikTok?
- es Q: ¿Es seguro usar SaveVid AI con TikTok?
- hi Q: क्या TikTok के लिए SaveVid AI इस्तेमाल करना सुरक्षित है?
- en A: Yes. There is no login and no account. We keep only anonymous, aggregate usage counts.
- es A: Sí. No hay inicio de sesión ni cuenta. Solo guardamos conteos de uso anónimos y agregados.
- hi A: हाँ। न कोई लॉगिन है, न कोई अकाउंट। हम सिर्फ़ इस्तेमाल के गुमनाम, कुल आँकड़े रखते हैं।

**Q5**
- en Q: What format and quality do TikTok downloads come in?
- es Q: ¿En qué formato y calidad se descargan los videos de TikTok?
- hi Q: TikTok डाउनलोड किस फ़ॉर्मैट और क्वालिटी में आते हैं?
- en A: mp4, in the best quality TikTok serves for that video: hd when available, sd otherwise. Photo slideshows save as the original images plus the soundtrack as audio.
- es A: mp4, en la mejor calidad que TikTok entrega para ese video: hd cuando está disponible, sd si no. Las presentaciones de fotos se guardan como las imágenes originales más la música como archivo de audio.
- hi A: mp4, उस वीडियो के लिए TikTok की सबसे अच्छी क्वालिटी में: उपलब्ध हो तो hd, वरना sd। फ़ोटो स्लाइडशो ओरिजिनल इमेज के रूप में सेव होते हैं, साथ में साउंडट्रैक ऑडियो के रूप में।

**Q6**
- en Q: How do I save TikTok videos on iPhone or Android?
- es Q: ¿Cómo guardo videos de TikTok en iPhone o Android?
- hi Q: iPhone या Android पर TikTok वीडियो कैसे सेव करें?
- en A: Paste the link and tap download on either. iPhone saves through Safari into the Files app; move it to Photos with the share sheet. Android saves straight to your Downloads folder.
- es A: En los dos: pega el enlace y toca descargar. En iPhone se guarda por Safari en la app Archivos; muévelo a Fotos con la hoja para compartir. Android lo guarda directo en tu carpeta de Descargas.
- hi A: दोनों पर: लिंक पेस्ट करें और डाउनलोड पर टैप करें। iPhone पर यह Safari के ज़रिए Files ऐप में सेव होता है; शेयर शीट से उसे Photos में ले जाएँ। Android उसे सीधे आपके Downloads फ़ोल्डर में सेव करता है।

**Q7** (hedged legality)
- en Q: Is it legal to download TikTok videos?
- es Q: ¿Es legal descargar videos de TikTok?
- hi Q: क्या TikTok के वीडियो डाउनलोड करना कानूनी है?
- en A: Generally fine for personal use, like watching offline. The video belongs to its creator, so do not re-upload it or claim it as yours. You are responsible for how you use what you save.
- es A: Para uso personal, como verlo sin conexión, en general no hay problema. El video es de su creador, así que no lo vuelvas a subir ni lo presentes como tuyo. Tú eres responsable de lo que hagas con lo que guardas.
- hi A: निजी इस्तेमाल के लिए, जैसे ऑफ़लाइन देखना, आम तौर पर ठीक रहता है। वीडियो उसके क्रिएटर का है, इसलिए उसे दोबारा अपलोड न करें और न अपना बताएँ। जो सेव करें उसका इस्तेमाल आपकी ज़िम्मेदारी है।

**Q8**
- en Q: Who runs this?
- es Q: ¿Quién está detrás de esto?
- hi Q: इसे कौन चलाता है?
- en A: SaveVid AI is built by @israfill.
- es A: SaveVid AI está hecho por @israfill.
- hi A: SaveVid AI को @israfill ने बनाया है।

---

### 3.3 Reddit (`/redditvideodownloader`, `/es/...`, `/hi/...`)

**meta title**
- en: `Reddit Video Downloader - With Audio, Free | SaveVid AI`
- es: `Descargar videos de Reddit con audio - Gratis | SaveVid AI`
- hi: `Reddit वीडियो डाउनलोडर - ऑडियो के साथ, फ़्री | SaveVid AI`

**meta description**
- en: Download Reddit videos with the audio merged in, in original quality. No fake download buttons, no forced redirects. Free and instant.
- es: Descarga videos de Reddit con el audio ya unido, en calidad original. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.
- hi: Reddit वीडियो ऑडियो के साथ, ओरिजिनल क्वालिटी में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।

**og:description + twitter:description**
- en: Paste a Reddit post link, get the video with audio, in seconds. No fake buttons.
- es: Pega el enlace de un post de Reddit y obtén el video con audio, en segundos. Sin botones falsos.
- hi: Reddit पोस्ट का लिंक पेस्ट करें, कुछ ही सेकंड में ऑडियो के साथ वीडियो पाएँ। कोई नकली बटन नहीं।

**hero h1**
- en: `Reddit Video` + `Downloader`
- es: `Descargar videos` + `de Reddit`
- hi: `Reddit वीडियो` + `डाउनलोडर`

**lede**
- en: Paste a Reddit post link, get the video with audio, in seconds.
- es: Pega el enlace de un post de Reddit y obtén el video con audio, en segundos.
- hi: Reddit पोस्ट का लिंक पेस्ट करें और कुछ ही सेकंड में ऑडियो के साथ वीडियो पाएँ।

**input placeholder**
- en: Paste a Reddit post link
- es: Pega el enlace de un post de Reddit
- hi: Reddit पोस्ट का लिंक पेस्ट करें

**input aria-label**
- en: Reddit post link
- es: Enlace de un post de Reddit
- hi: Reddit पोस्ट का लिंक

**hero note**
- en: Video and audio merged into one file. No fake buttons.
- es: Video y audio unidos en un solo archivo. Sin botones falsos.
- hi: वीडियो और ऑडियो एक ही फ़ाइल में। कोई नकली बटन नहीं।

**chips**: `chip.example`, `chip.noLogin`, `chip.withAudio`, `chip.originalQuality`
(no watermark chip here: that claim is Twitter/TikTok-only)

**footer description**
- en: Reddit video downloader. No fake buttons. One paste, audio merged in.
- es: Descargador de videos de Reddit. Sin botones falsos. Pegas una vez, con el audio ya unido.
- hi: Reddit वीडियो डाउनलोडर। कोई नकली बटन नहीं। एक पेस्ट, ऑडियो जुड़ा हुआ।

#### How it works

**Step 1 heading**
- en: Open the Reddit post
- es: Abre el post de Reddit
- hi: Reddit पोस्ट खोलें

**Step 1 body**
- en: On the post you want, tap Share, then Copy link. Works with reddit.com links and the short redd.it share links.
- es: En el post que quieres, toca Compartir y luego Copiar enlace. Funciona con los enlaces de reddit.com y los cortos de redd.it.
- hi: जो पोस्ट चाहिए, उस पर Share दबाएँ, फिर Copy link। reddit.com के लिंक और छोटे redd.it शेयर लिंक, दोनों चलते हैं।

**Step 2 heading**
- en: Paste it above
- es: Pégalo arriba
- hi: उसे ऊपर पेस्ट करें

**Step 2 body**
- en: The preview appears in about a second, with the video ready to save.
- es: La vista previa aparece en un segundo, con el video listo para guardar.
- hi: करीब एक सेकंड में प्रीव्यू आ जाता है, वीडियो सेव करने के लिए तैयार।

**Step 3 heading**
- en: Download
- es: Descarga
- hi: डाउनलोड करें

**Step 3 body**
- en: The video saves straight to your device with the audio merged in and a clean filename.
- es: El video se guarda directo en tu dispositivo con el audio ya unido y un nombre de archivo limpio.
- hi: वीडियो सीधे आपके डिवाइस में सेव होता है, ऑडियो जुड़ा हुआ और साफ़ फ़ाइल नाम के साथ।

#### FAQ (8 entries; entries 1-4 are JSON-LD mirrored)

**Q1 [JSON-LD]**
- en Q: Does the Reddit video download come with audio?
- es Q: ¿La descarga del video de Reddit incluye el audio?
- hi Q: क्या Reddit वीडियो डाउनलोड ऑडियो के साथ आता है?
- en A: Yes. Reddit stores video and audio as separate streams, and SaveVid AI merges them automatically so you get one file with sound.
- es A: Sí. Reddit guarda el video y el audio como pistas separadas, y SaveVid AI las une automáticamente para que obtengas un solo archivo con sonido.
- hi A: हाँ। Reddit वीडियो और ऑडियो को अलग-अलग स्ट्रीम में रखता है, और SaveVid AI उन्हें अपने आप जोड़ देता है, ताकि आपको आवाज़ के साथ एक ही फ़ाइल मिले।

**Q2 [JSON-LD]**
- en Q: Can I download Reddit galleries?
- es Q: ¿Puedo descargar galerías de Reddit?
- hi Q: क्या मैं Reddit की गैलरी डाउनलोड कर सकता हूँ?
- en A: Not yet. Reddit galleries are coming; videos, GIFs, and single images work today.
- es A: Todavía no. Las galerías de Reddit están en camino; los videos, los GIF y las imágenes sueltas ya funcionan.
- hi A: अभी नहीं। Reddit गैलरी आने वाली है; वीडियो, GIF और सिंगल इमेज पहले से चलती हैं।

**Q3 [JSON-LD]**
- en Q: Is the Reddit downloader really free?
- es Q: ¿El descargador de Reddit es de verdad gratis?
- hi Q: क्या Reddit डाउनलोडर सच में फ़्री है?
- en A: Yes. No fake download buttons and no forced redirects.
- es A: Sí. Sin botones de descarga falsos ni redirecciones forzadas.
- hi A: हाँ। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं।

**Q4 [JSON-LD]**
- en Q: Is it safe to use SaveVid AI for Reddit?
- es Q: ¿Es seguro usar SaveVid AI con Reddit?
- hi Q: क्या Reddit के लिए SaveVid AI इस्तेमाल करना सुरक्षित है?
- en A: Yes. There is no login and no account. We keep only anonymous, aggregate usage counts.
- es A: Sí. No hay inicio de sesión ni cuenta. Solo guardamos conteos de uso anónimos y agregados.
- hi A: हाँ। न कोई लॉगिन है, न कोई अकाउंट। हम सिर्फ़ इस्तेमाल के गुमनाम, कुल आँकड़े रखते हैं।

**Q5**
- en Q: What format do Reddit videos download in?
- es Q: ¿En qué formato se descargan los videos de Reddit?
- hi Q: Reddit के वीडियो किस फ़ॉर्मैट में डाउनलोड होते हैं?
- en A: mp4, one normal file that plays anywhere. GIFs save as mp4 too, and images download in their original format.
- es A: mp4, un archivo normal que se reproduce en cualquier lado. Los GIF también se guardan en mp4, y las imágenes se descargan en su formato original.
- hi A: mp4, एक आम फ़ाइल जो कहीं भी चलती है। GIF भी mp4 में सेव होते हैं, और इमेज अपने ओरिजिनल फ़ॉर्मैट में डाउनलोड होती हैं।

**Q6**
- en Q: How do I save Reddit videos on iPhone or Android?
- es Q: ¿Cómo guardo videos de Reddit en iPhone o Android?
- hi Q: iPhone या Android पर Reddit के वीडियो कैसे सेव करें?
- en A: Paste the post link and tap download. iPhone saves through Safari into the Files app; the share sheet moves it to Photos. Android saves to your Downloads folder.
- es A: Pega el enlace del post y toca descargar. En iPhone se guarda por Safari en la app Archivos; la hoja para compartir lo mueve a Fotos. Android lo guarda en tu carpeta de Descargas.
- hi A: पोस्ट का लिंक पेस्ट करें और डाउनलोड पर टैप करें। iPhone पर यह Safari के ज़रिए Files ऐप में सेव होता है; शेयर शीट से वह Photos में चला जाता है। Android उसे आपके Downloads फ़ोल्डर में सेव करता है।

**Q7** (hedged legality)
- en Q: Is it legal to download Reddit videos?
- es Q: ¿Es legal descargar videos de Reddit?
- hi Q: क्या Reddit के वीडियो डाउनलोड करना कानूनी है?
- en A: Generally fine for personal use. Content belongs to its poster and the communities it came from, so do not re-upload it as yours. You are responsible for how you use what you save.
- es A: Para uso personal, en general no hay problema. El contenido es de quien lo publicó y de las comunidades de donde salió, así que no lo vuelvas a subir como tuyo. Tú eres responsable de lo que hagas con lo que guardas.
- hi A: निजी इस्तेमाल के लिए आम तौर पर ठीक रहता है। कंटेंट उसे पोस्ट करने वाले का और उन कम्युनिटी का है जहाँ से वह आया, इसलिए उसे अपना बताकर दोबारा अपलोड न करें। जो सेव करें उसका इस्तेमाल आपकी ज़िम्मेदारी है।

**Q8**
- en Q: Who runs this?
- es Q: ¿Quién está detrás de esto?
- hi Q: इसे कौन चलाता है?
- en A: SaveVid AI is built by @israfill.
- es A: SaveVid AI está hecho por @israfill.
- hi A: SaveVid AI को @israfill ने बनाया है।

---

### 3.4 Instagram (`/instagramvideodownloader`, `/es/...`, `/hi/...`)

**meta title**
- en: `Instagram Reel Downloader - Fast, Free, HD | SaveVid AI`
- es: `Descargar reels de Instagram - Rápido, gratis, HD | SaveVid AI`
- hi: `Instagram रील डाउनलोडर - तेज़, फ़्री, HD | SaveVid AI`

**meta description**
- en: Download Instagram reels and videos in HD. No fake download buttons, no forced redirects. Free and instant.
- es: Descarga reels y videos de Instagram en HD. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.
- hi: Instagram की रील और वीडियो HD में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।

**og:description + twitter:description**
- en: Paste an Instagram link, get the video in seconds. No fake buttons.
- es: Pega un enlace de Instagram y obtén el video en segundos. Sin botones falsos.
- hi: Instagram का लिंक पेस्ट करें, कुछ ही सेकंड में वीडियो पाएँ। कोई नकली बटन नहीं।

**hero h1**
- en: `Instagram Reel` + `Downloader`
- es: `Descargar reels` + `de Instagram`
- hi: `Instagram रील` + `डाउनलोडर`

**lede**
- en: Paste an Instagram link, get the video in HD. No fake buttons.
- es: Pega un enlace de Instagram y obtén el video en HD. Sin botones falsos.
- hi: Instagram का लिंक पेस्ट करें और HD में वीडियो पाएँ। कोई नकली बटन नहीं।

**input placeholder**
- en: Paste an Instagram reel or post link
- es: Pega el enlace de un reel o post de Instagram
- hi: Instagram रील या पोस्ट का लिंक पेस्ट करें

**input aria-label**
- en: Instagram reel or post link
- es: Enlace de un reel o post de Instagram
- hi: Instagram रील या पोस्ट का लिंक

**hero note** (the carousel limit, stated up front)
- en: Carousel posts save the first photo or video only, for now.
- es: Por ahora, de los posts en carrusel se guarda solo la primera foto o video.
- hi: फ़िलहाल कैरोसेल पोस्ट से सिर्फ़ पहली फ़ोटो या वीडियो ही सेव होता है।

**chips**: `chip.example`, `chip.noLogin`, `chip.hdQuality`, `chip.publicOnly`

**footer description**
- en: Instagram reel downloader. No fake buttons.
- es: Descargador de reels de Instagram. Sin botones falsos.
- hi: Instagram रील डाउनलोडर। कोई नकली बटन नहीं।

#### How it works

**Step 1 heading**
- en: Paste the Instagram link
- es: Pega el enlace de Instagram
- hi: Instagram का लिंक पेस्ट करें

**Step 1 body**
- en: On the reel or post you want, tap Share, then Copy link. Works with reel and post links from instagram.com.
- es: En el reel o post que quieres, toca Compartir y luego Copiar enlace. Funciona con enlaces de reels y de posts de instagram.com.
- hi: जो रील या पोस्ट चाहिए, उस पर Share दबाएँ, फिर Copy link। instagram.com के रील और पोस्ट, दोनों के लिंक चलते हैं।

**Step 2 heading**
- en: Pick your file
- es: Elige tu archivo
- hi: अपनी फ़ाइल चुनें

**Step 2 body**
- en: The preview appears in about a second, with the video or photo ready to save.
- es: La vista previa aparece en un segundo, con tu archivo listo para guardar.
- hi: करीब एक सेकंड में प्रीव्यू आ जाता है, वीडियो या फ़ोटो सेव करने के लिए तैयार।

**Step 3 heading**
- en: No fake buttons
- es: Sin botones falsos
- hi: कोई नकली बटन नहीं

**Step 3 body**
- en: The file saves straight to your device with a clean filename. No fake buttons, no detours.
- es: El archivo se guarda directo en tu dispositivo con un nombre de archivo limpio. Sin botones falsos, sin rodeos.
- hi: फ़ाइल सीधे आपके डिवाइस में सेव होती है, साफ़ फ़ाइल नाम के साथ। कोई नकली बटन नहीं, कोई चक्कर नहीं।

#### FAQ (8 entries; entries 1-4 are JSON-LD mirrored)

**Q1 [JSON-LD]**
- en Q: Can I download Instagram reels?
- es Q: ¿Puedo descargar reels de Instagram?
- hi Q: क्या मैं Instagram की रील डाउनलोड कर सकता हूँ?
- en A: Yes. Paste the reel link and you get the video in HD, straight from Instagram's servers. Public posts only.
- es A: Sí. Pega el enlace del reel y obtienes el video en HD, directo desde los servidores de Instagram. Solo posts públicos.
- hi A: हाँ। रील का लिंक पेस्ट करें और आपको सीधे Instagram के सर्वर से HD में वीडियो मिलता है। सिर्फ़ पब्लिक पोस्ट।

**Q2 [JSON-LD]**
- en Q: Is the Instagram downloader free?
- es Q: ¿El descargador de Instagram es gratis?
- hi Q: क्या Instagram डाउनलोडर फ़्री है?
- en A: Yes. No fake download buttons and no forced redirects.
- es A: Sí. Sin botones de descarga falsos ni redirecciones forzadas.
- hi A: हाँ। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं।

**Q3 [JSON-LD]**
- en Q: Can I download photo carousels?
- es Q: ¿Puedo descargar carruseles de fotos?
- hi Q: क्या मैं फ़ोटो कैरोसेल डाउनलोड कर सकता हूँ?
- en A: Carousel posts save the first photo or video only for now. Single photos and reels download in full.
- es A: Por ahora, de los posts en carrusel se guarda solo la primera foto o video. Las fotos sueltas y los reels se descargan completos.
- hi A: फ़िलहाल कैरोसेल पोस्ट से सिर्फ़ पहली फ़ोटो या वीडियो ही सेव होता है। सिंगल फ़ोटो और रील पूरी डाउनलोड होती हैं।

**Q4 [JSON-LD]**
- en Q: Is it safe to use SaveVid AI for Instagram?
- es Q: ¿Es seguro usar SaveVid AI con Instagram?
- hi Q: क्या Instagram के लिए SaveVid AI इस्तेमाल करना सुरक्षित है?
- en A: Yes. There is no login and no account. We keep only anonymous, aggregate usage counts.
- es A: Sí. No hay inicio de sesión ni cuenta. Solo guardamos conteos de uso anónimos y agregados.
- hi A: हाँ। न कोई लॉगिन है, न कोई अकाउंट। हम सिर्फ़ इस्तेमाल के गुमनाम, कुल आँकड़े रखते हैं।

**Q5**
- en Q: What format do Instagram downloads come in?
- es Q: ¿En qué formato se descargan los archivos de Instagram?
- hi Q: Instagram डाउनलोड किस फ़ॉर्मैट में आते हैं?
- en A: Reels and videos save as mp4 in the quality Instagram serves. Single photos save as the original image file.
- es A: Los reels y los videos se guardan en mp4, en la calidad que entrega Instagram. Las fotos sueltas se guardan como el archivo de imagen original.
- hi A: रील और वीडियो mp4 में सेव होते हैं, उसी क्वालिटी में जो Instagram देता है। सिंगल फ़ोटो ओरिजिनल इमेज फ़ाइल के रूप में सेव होती है।

**Q6**
- en Q: How do I save Instagram reels on iPhone or Android?
- es Q: ¿Cómo guardo reels de Instagram en iPhone o Android?
- hi Q: iPhone या Android पर Instagram की रील कैसे सेव करें?
- en A: Paste the reel link and tap download. iPhone saves through Safari into the Files app; use the share sheet to move it to Photos. Android saves to your Downloads folder.
- es A: Pega el enlace del reel y toca descargar. En iPhone se guarda por Safari en la app Archivos; usa la hoja para compartir para moverlo a Fotos. Android lo guarda en tu carpeta de Descargas.
- hi A: रील का लिंक पेस्ट करें और डाउनलोड पर टैप करें। iPhone पर यह Safari के ज़रिए Files ऐप में सेव होता है; शेयर शीट से उसे Photos में ले जाएँ। Android उसे आपके Downloads फ़ोल्डर में सेव करता है।

**Q7** (hedged legality)
- en Q: Is it legal to download Instagram reels?
- es Q: ¿Es legal descargar reels de Instagram?
- hi Q: क्या Instagram की रील डाउनलोड करना कानूनी है?
- en A: Generally fine for personal use, like watching offline. The reel belongs to its creator, so do not re-upload it or pass it off as yours. You are responsible for how you use what you save.
- es A: Para uso personal, como verlo sin conexión, en general no hay problema. El reel es de su creador, así que no lo vuelvas a subir ni lo hagas pasar por tuyo. Tú eres responsable de lo que hagas con lo que guardas.
- hi A: निजी इस्तेमाल के लिए, जैसे ऑफ़लाइन देखना, आम तौर पर ठीक रहता है। रील उसके क्रिएटर की है, इसलिए उसे दोबारा अपलोड न करें और न अपनी बताएँ। जो सेव करें उसका इस्तेमाल आपकी ज़िम्मेदारी है।

**Q8**
- en Q: Who runs this?
- es Q: ¿Quién está detrás de esto?
- hi Q: इसे कौन चलाता है?
- en A: SaveVid AI is built by @israfill.
- es A: SaveVid AI está hecho por @israfill.
- hi A: SaveVid AI को @israfill ने बनाया है।

---

### 3.5 Facebook (`/facebookvideodownloader`, `/es/...`, `/hi/...`)

**meta title**
- en: `Facebook Video Downloader - Fast, Free, HD | SaveVid AI`
- es: `Descargar videos de Facebook - Rápido, gratis, HD | SaveVid AI`
- hi: `Facebook वीडियो डाउनलोडर - तेज़, फ़्री, HD | SaveVid AI`

**meta description**
- en: Download Facebook videos and reels in HD. No fake download buttons, no forced redirects. Free and instant.
- es: Descarga videos y reels de Facebook en HD. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.
- hi: Facebook के वीडियो और रील HD में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।

**og:description + twitter:description**
- en: Paste a Facebook link, get the video in seconds. No fake buttons.
- es: Pega un enlace de Facebook y obtén el video en segundos. Sin botones falsos.
- hi: Facebook का लिंक पेस्ट करें, कुछ ही सेकंड में वीडियो पाएँ। कोई नकली बटन नहीं।

**hero h1**
- en: `Facebook Video` + `Downloader`
- es: `Descargar videos` + `de Facebook`
- hi: `Facebook वीडियो` + `डाउनलोडर`

**lede**
- en: Paste a Facebook link, get the video in HD. No fake buttons.
- es: Pega un enlace de Facebook y obtén el video en HD. Sin botones falsos.
- hi: Facebook का लिंक पेस्ट करें और HD में वीडियो पाएँ। कोई नकली बटन नहीं।

**input placeholder**
- en: Paste a Facebook video or reel link
- es: Pega el enlace de un video o reel de Facebook
- hi: Facebook वीडियो या रील का लिंक पेस्ट करें

**input aria-label**
- en: Facebook video or reel link
- es: Enlace de un video o reel de Facebook
- hi: Facebook वीडियो या रील का लिंक

**hero note** (the support limit, stated up front)
- en: Photo posts and private videos are not supported: public videos and reels only.
- es: Los posts de fotos y los videos privados no funcionan: solo videos y reels públicos.
- hi: फ़ोटो पोस्ट और प्राइवेट वीडियो सपोर्ट नहीं हैं: सिर्फ़ पब्लिक वीडियो और रील।

**chips**: `chip.example`, `chip.noLogin`, `chip.hdQuality`, `chip.publicOnly`

**footer description**
- en: Facebook video downloader. No fake buttons.
- es: Descargador de videos de Facebook. Sin botones falsos.
- hi: Facebook वीडियो डाउनलोडर। कोई नकली बटन नहीं।

#### How it works

**Step 1 heading**
- en: Paste the Facebook link
- es: Pega el enlace de Facebook
- hi: Facebook का लिंक पेस्ट करें

**Step 1 body**
- en: On the video or reel you want, tap Share, then Copy link. Works with facebook.com video, reel, and share links.
- es: En el video o reel que quieres, toca Compartir y luego Copiar enlace. Funciona con los enlaces de video, de reel y de compartir de facebook.com.
- hi: जो वीडियो या रील चाहिए, उस पर Share दबाएँ, फिर Copy link। facebook.com के वीडियो, रील और शेयर लिंक, सब चलते हैं।

**Step 2 heading**
- en: Check the preview
- es: Revisa la vista previa
- hi: प्रीव्यू देखें

**Step 2 body**
- en: The preview appears in about a second, with the video ready to save.
- es: La vista previa aparece en un segundo, con el video listo para guardar.
- hi: करीब एक सेकंड में प्रीव्यू आ जाता है, वीडियो सेव करने के लिए तैयार।

**Step 3 heading**
- en: No fake buttons
- es: Sin botones falsos
- hi: कोई नकली बटन नहीं

**Step 3 body**
- en: The video saves straight to your device with a clean filename. No fake buttons, no detours.
- es: El video se guarda directo en tu dispositivo con un nombre de archivo limpio. Sin botones falsos, sin rodeos.
- hi: वीडियो सीधे आपके डिवाइस में सेव होता है, साफ़ फ़ाइल नाम के साथ। कोई नकली बटन नहीं, कोई चक्कर नहीं।

#### FAQ (8 entries; entries 1-4 are JSON-LD mirrored)

**Q1 [JSON-LD]**
- en Q: Can I download Facebook videos and reels?
- es Q: ¿Puedo descargar videos y reels de Facebook?
- hi Q: क्या मैं Facebook के वीडियो और रील डाउनलोड कर सकता हूँ?
- en A: Yes. Paste the video or reel link and you get the file in HD, straight from Facebook's servers. Public posts only.
- es A: Sí. Pega el enlace del video o del reel y obtienes el archivo en HD, directo desde los servidores de Facebook. Solo posts públicos.
- hi A: हाँ। वीडियो या रील का लिंक पेस्ट करें और आपको सीधे Facebook के सर्वर से HD में फ़ाइल मिलती है। सिर्फ़ पब्लिक पोस्ट।

**Q2 [JSON-LD]**
- en Q: Is the Facebook downloader free?
- es Q: ¿El descargador de Facebook es gratis?
- hi Q: क्या Facebook डाउनलोडर फ़्री है?
- en A: Yes. No fake download buttons and no forced redirects.
- es A: Sí. Sin botones de descarga falsos ni redirecciones forzadas.
- hi A: हाँ। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं।

**Q3 [JSON-LD]**
- en Q: Can I download photos or private videos?
- es Q: ¿Puedo descargar fotos o videos privados?
- hi Q: क्या मैं फ़ोटो या प्राइवेट वीडियो डाउनलोड कर सकता हूँ?
- en A: Not yet. Photo posts and private or friends-only videos are not supported: public videos and reels only.
- es A: Todavía no. Los posts de fotos y los videos privados o solo para amigos no funcionan: solo videos y reels públicos.
- hi A: अभी नहीं। फ़ोटो पोस्ट और प्राइवेट या सिर्फ़ दोस्तों को दिखने वाले वीडियो सपोर्ट नहीं हैं: सिर्फ़ पब्लिक वीडियो और रील।

**Q4 [JSON-LD]**
- en Q: Is it safe to use SaveVid AI for Facebook?
- es Q: ¿Es seguro usar SaveVid AI con Facebook?
- hi Q: क्या Facebook के लिए SaveVid AI इस्तेमाल करना सुरक्षित है?
- en A: Yes. There is no login and no account. We keep only anonymous, aggregate usage counts.
- es A: Sí. No hay inicio de sesión ni cuenta. Solo guardamos conteos de uso anónimos y agregados.
- hi A: हाँ। न कोई लॉगिन है, न कोई अकाउंट। हम सिर्फ़ इस्तेमाल के गुमनाम, कुल आँकड़े रखते हैं।

**Q5**
- en Q: What format do Facebook videos download in?
- es Q: ¿En qué formato se descargan los videos de Facebook?
- hi Q: Facebook के वीडियो किस फ़ॉर्मैट में डाउनलोड होते हैं?
- en A: mp4 in the best quality Facebook serves for that video, as a single file with audio included.
- es A: mp4, en la mejor calidad que Facebook entrega para ese video, como un solo archivo con el audio incluido.
- hi A: mp4, उस वीडियो के लिए Facebook की सबसे अच्छी क्वालिटी में, एक ही फ़ाइल में ऑडियो के साथ।

**Q6**
- en Q: How do I save Facebook videos on iPhone or Android?
- es Q: ¿Cómo guardo videos de Facebook en iPhone o Android?
- hi Q: iPhone या Android पर Facebook के वीडियो कैसे सेव करें?
- en A: Paste the video or reel link and tap download. iPhone saves through Safari into the Files app; the share sheet moves it to Photos. Android saves to your Downloads folder.
- es A: Pega el enlace del video o del reel y toca descargar. En iPhone se guarda por Safari en la app Archivos; la hoja para compartir lo mueve a Fotos. Android lo guarda en tu carpeta de Descargas.
- hi A: वीडियो या रील का लिंक पेस्ट करें और डाउनलोड पर टैप करें। iPhone पर यह Safari के ज़रिए Files ऐप में सेव होता है; शेयर शीट से वह Photos में चला जाता है। Android उसे आपके Downloads फ़ोल्डर में सेव करता है।

**Q7** (hedged legality)
- en Q: Is it legal to download Facebook videos?
- es Q: ¿Es legal descargar videos de Facebook?
- hi Q: क्या Facebook के वीडियो डाउनलोड करना कानूनी है?
- en A: Generally fine for personal use. The video belongs to its creator, so do not re-upload it or claim it as yours. You are responsible for how you use what you save.
- es A: Para uso personal, en general no hay problema. El video es de su creador, así que no lo vuelvas a subir ni lo presentes como tuyo. Tú eres responsable de lo que hagas con lo que guardas.
- hi A: निजी इस्तेमाल के लिए आम तौर पर ठीक रहता है। वीडियो उसके क्रिएटर का है, इसलिए उसे दोबारा अपलोड न करें और न अपना बताएँ। जो सेव करें उसका इस्तेमाल आपकी ज़िम्मेदारी है।

**Q8**
- en Q: Who runs this?
- es Q: ¿Quién está detrás de esto?
- hi Q: इसे कौन चलाता है?
- en A: SaveVid AI is built by @israfill.
- es A: SaveVid AI está hecho por @israfill.
- hi A: SaveVid AI को @israfill ने बनाया है।

---

## 4. HowToVisual SVG strings

These sit at hand-placed `x`/`y` coordinates inside fixed-width mock UI shapes.
**Length budget: es/hi must stay within ~1.3x the English character count.** Where
a literal translation blew the budget it was compressed; every compression is
noted. Nothing below may be lengthened later without re-checking the layout at
both the landscape (`sm+`) and stacked (phone) breakpoints.

**Character count is a horizontal proxy only. Devanagari also needs VERTICAL
room**, and `.hero-h1` is the risk surface: line-height 1 plus a negative margin
plus `overflow: hidden` will clip the upper matra and the lower vowel signs of
Devanagari, which sit outside the Latin em box. The live gate MUST verify, at
both breakpoints, that the hi h1 renders unclipped: part B "डाउनलोडर" (the ो
matra) and part A "वीडियो" (the ी and ो matras). Named fix if it clips: a
locale-conditional line-height on `.hero-h1` (do NOT shorten the Hindi string
to dodge the clip).

Same check for the SVG: any hi label at ratio **>= 0.95** in the tables below is
close enough to the English box that it must be eyeballed at both breakpoints,
not just counted. That currently means `svg.savedToDevice` (0.95) and the
twitter footer line (1.02), on top of the es strings already flagged.

Strings that are IDENTICAL in all three locales and must not be touched:
the step badges `1` `2` `3`, `HD`, `SD`, `720p`, `480p`, `1920×1080`, `1280×720`,
`640×360`, `34 MB`, `18 MB`, `6 MB`, the URL mocks
(`x.com/i/status/2071…`, `tiktok.com/@user/vid…`, `reddit.com/r/aww/comm…`,
`instagram.com/reel/Db…`, `facebook.com/watch?v=1…`) and the filenames
(`ada_2071_1080p.mp4`, `user_123_hd.mp4`, `user_1abc23x_720p.mp4`,
`DbKoX9xTgPz_hd.mp4`, `10153231379946729_hd.mp4`).

### 4.1 Shared SVG labels (all five visuals)

| key | en (len) | es (len, ratio) | hi (len, ratio) |
| --- | --- | --- | --- |
| `svg.copyLink` | Copy link (9) | Copiar enlace (13, 1.44) | Copy link (9, 1.0) |
| `svg.fetch` | Fetch (5) | Buscar (6, 1.2) | पाएँ (4, 0.8) |
| `svg.savedToDevice` | saved to your device (20) | guardado en tu dispositivo (26, 1.30) | आपके डिवाइस में सेव (19, 0.95) |

`svg.copyLink` es is 1.44x, over budget on raw characters. It is kept anyway
because it sits inside the 136-unit share-menu card with 20 units of slack at
`fontSize 16.5`, and it is a name the user must recognize from their own
Spanish-language app UI ("Copiar enlace" is the literal iOS/Android string).
**Verify visually at both breakpoints during the live gate**; if it overflows,
shorten the card's inner padding, not the string.

`svg.copyLink` hi stays LATIN "Copy link": it is the label of the platform's own
share menu, so it follows the OS-UI rule in section 1 and matches the step-1
prose, which also instructs "फिर Copy link".

`svg.fetch` hi "पाएँ" is a compression: "फ़ेच करें" is not a real Hindi
loanword and "डाउनलोड करें" would collide with the nav button. See section 5.

### 4.2 Per-platform SVG footer line

| platform | en (len) | es (len, ratio) | hi (len, ratio) |
| --- | --- | --- | --- |
| twitter | No watermark. Straight from Twitter's CDN. (41) | Sin marca de agua. Directo del CDN de Twitter. (45, 1.10) | कोई वॉटरमार्क नहीं। सीधे Twitter के CDN से। (42, 1.02) |
| tiktok | No watermark. Straight from the source. (39) | Sin marca de agua. Directo desde la fuente. (43, 1.10) | कोई वॉटरमार्क नहीं। सीधे सोर्स से। (34, 0.87) |
| reddit | With audio. Straight from the source. (37) | Con audio. Directo desde la fuente. (35, 0.95) | ऑडियो के साथ। सीधे सोर्स से। (28, 0.76) |
| instagram | Straight from Instagram's servers. (34) | Directo de los servidores de Instagram. (39, 1.15) | सीधे Instagram के सर्वर से। (27, 0.79) |
| facebook | Straight from Facebook's servers. (33) | Directo de los servidores de Facebook. (38, 1.15) | सीधे Facebook के सर्वर से। (26, 0.79) |

Compressions applied: twitter es uses "Directo del CDN de Twitter" rather than
"Directo desde el CDN de Twitter" (saves 5 chars, same meaning); instagram and
facebook es use "Directo de los servidores de X" rather than
"Directo desde los servidores de X" (saves 5 chars each). The prose hero note
keeps the longer "Directo desde el CDN de Twitter" form: only the SVG is
compressed.

### 4.3 figcaption (sr-only) and SVG aria-label

Not length-constrained (screen-reader only), but kept tight.

**Twitter, TikTok, Reddit figcaption** (identical English on all three)
- en: Copy the post link, paste it above, pick a quality, and the video saves with a clean filename.
- es: Copia el enlace del post, pégalo arriba, elige una calidad y el video se guarda con un nombre de archivo limpio.
- hi: पोस्ट का लिंक कॉपी करें, ऊपर पेस्ट करें, क्वालिटी चुनें, और वीडियो साफ़ फ़ाइल नाम के साथ सेव हो जाता है।

**Instagram figcaption**
- en: Copy the reel link, paste it above, then click the quality to save the video with a clean filename.
- es: Copia el enlace del reel, pégalo arriba y haz clic en la calidad para guardar el video con un nombre de archivo limpio.
- hi: रील का लिंक कॉपी करें, ऊपर पेस्ट करें, फिर क्वालिटी पर क्लिक करके वीडियो साफ़ फ़ाइल नाम के साथ सेव करें।

**Facebook figcaption**
- en: Copy the video link, paste it above, then click the quality to save the video with a clean filename.
- es: Copia el enlace del video, pégalo arriba y haz clic en la calidad para guardar el video con un nombre de archivo limpio.
- hi: वीडियो का लिंक कॉपी करें, ऊपर पेस्ट करें, फिर क्वालिटी पर क्लिक करके वीडियो साफ़ फ़ाइल नाम के साथ सेव करें।

**SVG aria-label** (the SAME string goes on both the landscape and the stacked svg)

Twitter
- en: How to download: copy the post link from Twitter, paste it in the box, then pick a quality to save the video
- es: Cómo descargar: copia el enlace del post en Twitter, pégalo en el cuadro y elige una calidad para guardar el video
- hi: कैसे डाउनलोड करें: Twitter से पोस्ट का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए क्वालिटी चुनें

TikTok
- en: How to download: copy the post link from TikTok, paste it in the box, then pick a quality to save the video
- es: Cómo descargar: copia el enlace del post en TikTok, pégalo en el cuadro y elige una calidad para guardar el video
- hi: कैसे डाउनलोड करें: TikTok से पोस्ट का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए क्वालिटी चुनें

Reddit
- en: How to download: copy the post link from Reddit, paste it in the box, then pick a quality to save the video
- es: Cómo descargar: copia el enlace del post en Reddit, pégalo en el cuadro y elige una calidad para guardar el video
- hi: कैसे डाउनलोड करें: Reddit से पोस्ट का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए क्वालिटी चुनें

Instagram
- en: How to download: copy the reel link from Instagram, paste it in the box, then click HD to save the video
- es: Cómo descargar: copia el enlace del reel en Instagram, pégalo en el cuadro y haz clic en HD para guardar el video
- hi: कैसे डाउनलोड करें: Instagram से रील का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए HD पर क्लिक करें

Facebook
- en: How to download: copy the video link from Facebook, paste it in the box, then click HD to save the video
- es: Cómo descargar: copia el enlace del video en Facebook, pégalo en el cuadro y haz clic en HD para guardar el video
- hi: कैसे डाउनलोड करें: Facebook से वीडियो का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए HD पर क्लिक करें

---

## 5. Decisions worth an owner veto

1. **hi register is आप-polite, not तू/तुम.** The English voice is direct and
   lowercase; Hindi has no lowercase, and तुम-imperatives read as rude in an app.
   The neutral-polite करें/चुनें form is the closest natural equivalent.
2. **es h1 split puts the platform in the grey/small span** ("Descargar videos" +
   "de Twitter/X"). Any other split is either ungrammatical or repeats "de".
   The platform name stays in the h1 text, just in the smaller span.
3. **`input.submit` hi = "पाएँ" ("get").** "Fetch" has no Hindi loanword; the
   literal "लाएँ" reads odd as a button, and "डाउनलोड करें" would collide with
   the nav Download button. Paired success state is "मिल गया".
4. **`input.fetched` es = "Listo"** rather than "Obtenido": shorter, and it is
   what a Spanish-speaking user expects on a just-succeeded button.
5. **`platform.srSuffix` es = " para descargar videos"** instead of a bare
   " descargador", because Spanish is head-initial and "TikTok descargador"
   would be ungrammatical. Hindi keeps the bare " डाउनलोडर" (head-final).
6. **Footer anchors in es are verb-first** ("Descargar videos de TikTok") to
   match real Spanish search phrasing, so the internal-link anchors carry the
   query. The Hindi anchors stay noun-phrase ("TikTok वीडियो डाउनलोडर").
7. **Backend `body.message` stays English in all locales in v1.** A user on a
   hi page who hits an upstream error sees an English sentence. Stated here so
   nobody "fixes" it silently on the frontend; it is a separate backend task.

## 6. Counts (for the parity tests)

- Shared UI string rows: **61** (section 2, all 14 tables).
- Visible FAQ entries per locale: twitter 7, tiktok 8, reddit 8, instagram 8,
  facebook 8 = **39 per locale**, 117 across en+es+hi.
- JSON-LD FAQ entries per page per locale: 4 (always the first four visible
  entries, character-exact).
- Per-page non-FAQ strings: **16 each** (meta title, meta description,
  og/twitter description, h1 part A, h1 part B, lede, placeholder, aria-label,
  hero note, footer description, 3 step headings, 3 step bodies) = 80 per locale.
- HowToVisual: 3 shared SVG labels + 1 footer line + 1 figcaption + 1 aria-label
  per platform.
