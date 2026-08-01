/**
 * Spanish string table (neutral Latin American, tu-form throughout).
 *
 * Every value is copied character-for-character from section 2, 3 and 4 of
 * docs/superpowers/specs/2026-08-01-i18n-translations.md, which is the single
 * source of truth for es copy. Do not retranslate a string here: fix the doc
 * first, then mirror the change. Visible FAQ entries are deliberately absent:
 * they live in the es HTML shells, which stay their single source of truth.
 */

import type {
  LocaleStrings,
  PageStrings,
  SharedStrings,
  SharedSvgStrings,
} from "./types";

export const esShared: SharedStrings = {
  locale: "es",
  prefix: "/es",

  nav: {
    brand: "SaveVid AI",
    twitter: "Twitter/X",
    tiktok: "TikTok",
    reddit: "Reddit",
    instagram: "Instagram",
    facebook: "Facebook",
    downloadButton: "Descargar",
  },

  theme: {
    toLight: "Cambiar a modo claro",
    toDark: "Cambiar a modo oscuro",
  },

  input: {
    submit: "Buscar",
    fetched: "Listo",
  },

  chips: {
    example: "▶ prueba un ejemplo",
    noLogin: "sin registro",
    noWatermark: "sin marca de agua",
    originalQuality: "calidad original",
    withAudio: "con audio",
    hdQuality: "calidad hd",
    publicOnly: "solo posts públicos",
  },

  platform: {
    navLabel: "Elige una plataforma",
    twitter: "Twitter / X",
    tiktok: "TikTok",
    reddit: "Reddit",
    instagram: "Instagram",
    facebook: "Facebook",
    srSuffix: " para descargar videos",
  },

  preview: {
    videoSingle: "Video",
    videoN: "Video {n}",
    gifBadge: "GIF",
  },

  quality: {
    saved: "Guardado",
    downloading: "descargando",
    retry: "reintentar",
    hdChip: "HD",
  },

  photos: {
    sectionLabel: "Fotos",
    saveAll: "Guardar todas",
    sound: "Audio",
    soundSaved: "Audio guardado",
    soundRetry: "Reintentar audio",
    savePhotoN: "Guardar foto {n}",
  },

  ads: {
    regionLabel: "publicidad",
  },

  errors: {
    network: "Error de red. Revisa tu conexión e inténtalo de nuevo.",
    serverUnreachable:
      "No podemos conectar con el servidor de SaveVid ahora mismo. Inténtalo en un momento.",
    generic: "Algo salió mal. Inténtalo de nuevo.",
  },

  lang: {
    navLabel: "Idioma",
    en: "English",
    es: "Español",
    hi: "हिन्दी",
  },

  section: {
    howItWorksKicker: "cómo funciona",
    howItWorksTitle: "Tres pasos, sin cuentas",
    questionsKicker: "preguntas",
    faqTitle: "Preguntas frecuentes",
  },

  footer: {
    brand: "SaveVid AI",
    linksLabel: "Enlaces de SaveVid AI",
    platformsLabel: "Todos los descargadores",
    xLink: "X · @israfill",
    builtBy: "hecho por",
    copyright: "© 2026 SaveVid AI",
  },

  footerNav: {
    twitter: "Descargar videos de Twitter/X",
    tiktok: "Descargar videos de TikTok",
    reddit: "Descargar videos de Reddit",
    instagram: "Descargar reels de Instagram",
    facebook: "Descargar videos de Facebook",
  },
};

// Section 4.1: the three labels every HowToVisual shares.
const svgShared: SharedSvgStrings = {
  copyLink: "Copiar enlace",
  fetch: "Buscar",
  savedToDevice: "guardado en tu dispositivo",
};

export const esTwitter: PageStrings = {
  ...esShared,
  platformKey: "twitter",
  meta: {
    title: "Descargar videos de Twitter/X - Gratis, rápido, al instante | SaveVid AI",
    description:
      "Descarga videos y GIFs de Twitter/X en calidad original. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.",
    ogDescription:
      "Pega el enlace del post, elige una calidad, listo. Sin botones falsos, un solo clic real.",
  },
  hero: {
    h1a: "Descargar videos",
    h1b: "de Twitter/X",
    lede: "Pega la URL del tweet y obtén el video en 2 segundos.",
    placeholder: "Pega el enlace de un post de Twitter/X",
    inputAriaLabel: "Enlace de un post de Twitter/X",
    note: "Directo desde el CDN de Twitter. Sin botones falsos, un solo clic real.",
  },
  chipKeys: ["example", "noLogin", "noWatermark", "originalQuality"],
  footerDescription:
    "Descargador de videos de Twitter/X. Sin botones falsos. Pegas una vez, todas las calidades.",
  steps: [
    {
      heading: "Copia el enlace del post",
      body: "En el post con el video, toca Compartir y luego Copiar enlace. Funciona con x.com, twitter.com y los enlaces espejo de Discord.",
    },
    {
      heading: "Pégalo arriba",
      body: "La vista previa aparece en un segundo, con todas las calidades disponibles y el tamaño de cada archivo.",
    },
    {
      heading: "Elige un tamaño",
      body: "El video se guarda en tu dispositivo directo desde el CDN de Twitter, con un nombre de archivo limpio. Sin marca de agua, nunca.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "Sin marca de agua. Directo del CDN de Twitter.",
    figcaption:
      "Copia el enlace del post, pégalo arriba, elige una calidad y el video se guarda con un nombre de archivo limpio.",
    ariaLabel:
      "Cómo descargar: copia el enlace del post en Twitter, pégalo en el cuadro y elige una calidad para guardar el video",
  },
};

export const esTikTok: PageStrings = {
  ...esShared,
  platformKey: "tiktok",
  meta: {
    title: "Descargar videos de TikTok sin marca de agua - Gratis | SaveVid AI",
    description:
      "Descarga videos de TikTok sin la marca de agua, en calidad original. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.",
    ogDescription:
      "Pega un enlace de TikTok y obtén el video sin marca de agua, en segundos. Sin botones falsos, un solo clic real.",
  },
  hero: {
    h1a: "Descargar videos",
    h1b: "de TikTok",
    lede: "Pega un enlace de TikTok y obtén el video sin marca de agua, en segundos.",
    placeholder: "Pega el enlace de un video de TikTok",
    inputAriaLabel: "Enlace de un video de TikTok",
    note: "Archivo limpio, sin marca de agua. Sin botones falsos, un solo clic real.",
  },
  chipKeys: ["example", "noLogin", "noWatermark", "originalQuality"],
  footerDescription:
    "Descargador de videos de TikTok. Sin botones falsos. Pegas una vez, sin marca de agua.",
  steps: [
    {
      heading: "Abre el post de TikTok",
      body: "En el video que quieres, toca Compartir y luego Copiar enlace. Funciona con los enlaces de tiktok.com y los cortos de vm.tiktok.com.",
    },
    {
      heading: "Pégalo arriba",
      body: "La vista previa aparece en un segundo, con el video listo para guardar.",
    },
    {
      heading: "Descarga",
      body: "El video se guarda directo en tu dispositivo con un nombre de archivo limpio. Sin marca de agua, nunca.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "Sin marca de agua. Directo desde la fuente.",
    figcaption:
      "Copia el enlace del post, pégalo arriba, elige una calidad y el video se guarda con un nombre de archivo limpio.",
    ariaLabel:
      "Cómo descargar: copia el enlace del post en TikTok, pégalo en el cuadro y elige una calidad para guardar el video",
  },
};

export const esReddit: PageStrings = {
  ...esShared,
  platformKey: "reddit",
  meta: {
    title: "Descargar videos de Reddit con audio - Gratis | SaveVid AI",
    description:
      "Descarga videos de Reddit con el audio ya unido, en calidad original. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.",
    ogDescription:
      "Pega el enlace de un post de Reddit y obtén el video con audio, en segundos. Sin botones falsos, un solo clic real.",
  },
  hero: {
    h1a: "Descargar videos",
    h1b: "de Reddit",
    lede: "Pega el enlace de un post de Reddit y obtén el video con audio, en segundos.",
    placeholder: "Pega el enlace de un post de Reddit",
    inputAriaLabel: "Enlace de un post de Reddit",
    note: "Video y audio unidos en un solo archivo. Sin botones falsos, un solo clic real.",
  },
  chipKeys: ["example", "noLogin", "withAudio", "originalQuality"],
  footerDescription:
    "Descargador de videos de Reddit. Sin botones falsos. Pegas una vez, con el audio ya unido.",
  steps: [
    {
      heading: "Abre el post de Reddit",
      body: "En el post que quieres, toca Compartir y luego Copiar enlace. Funciona con los enlaces de reddit.com y los cortos de redd.it.",
    },
    {
      heading: "Pégalo arriba",
      body: "La vista previa aparece en un segundo, con el video listo para guardar.",
    },
    {
      heading: "Descarga",
      body: "El video se guarda directo en tu dispositivo con el audio ya unido y un nombre de archivo limpio.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "Con audio. Directo desde la fuente.",
    figcaption:
      "Copia el enlace del post, pégalo arriba, elige una calidad y el video se guarda con un nombre de archivo limpio.",
    ariaLabel:
      "Cómo descargar: copia el enlace del post en Reddit, pégalo en el cuadro y elige una calidad para guardar el video",
  },
};

export const esInstagram: PageStrings = {
  ...esShared,
  platformKey: "instagram",
  meta: {
    title: "Descargar reels de Instagram - Rápido, gratis, HD | SaveVid AI",
    description:
      "Descarga reels y videos de Instagram en HD. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.",
    ogDescription:
      "Pega un enlace de Instagram y obtén el video en segundos. Sin botones falsos, un solo clic real.",
  },
  hero: {
    h1a: "Descargar reels",
    h1b: "de Instagram",
    lede: "Pega un enlace de Instagram y obtén el video en HD. Sin botones falsos, un solo clic real.",
    placeholder: "Pega el enlace de un reel o post de Instagram",
    inputAriaLabel: "Enlace de un reel o post de Instagram",
    note: "Por ahora, de los posts en carrusel se guarda solo la primera foto o video.",
  },
  chipKeys: ["example", "noLogin", "hdQuality", "publicOnly"],
  footerDescription:
    "Descargador de reels de Instagram. Sin botones falsos. Pegas una vez, un solo clic real.",
  steps: [
    {
      heading: "Pega el enlace de Instagram",
      body: "En el reel o post que quieres, toca Compartir y luego Copiar enlace. Funciona con enlaces de reels y de posts de instagram.com.",
    },
    {
      heading: "Elige tu archivo",
      body: "La vista previa aparece en un segundo, con tu archivo listo para guardar.",
    },
    {
      heading: "Un solo clic real",
      body: "El archivo se guarda directo en tu dispositivo con un nombre de archivo limpio. Sin botones falsos, sin rodeos.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "Directo de los servidores de Instagram.",
    figcaption:
      "Copia el enlace del reel, pégalo arriba y haz clic en la calidad para guardar el video con un nombre de archivo limpio.",
    ariaLabel:
      "Cómo descargar: copia el enlace del reel en Instagram, pégalo en el cuadro y haz clic en HD para guardar el video",
  },
};

export const esFacebook: PageStrings = {
  ...esShared,
  platformKey: "facebook",
  meta: {
    title: "Descargar videos de Facebook - Rápido, gratis, HD | SaveVid AI",
    description:
      "Descarga videos y reels de Facebook en HD. Sin botones de descarga falsos ni redirecciones forzadas. Gratis y al instante.",
    ogDescription:
      "Pega un enlace de Facebook y obtén el video en segundos. Sin botones falsos, un solo clic real.",
  },
  hero: {
    h1a: "Descargar videos",
    h1b: "de Facebook",
    lede: "Pega un enlace de Facebook y obtén el video en HD. Sin botones falsos, un solo clic real.",
    placeholder: "Pega el enlace de un video o reel de Facebook",
    inputAriaLabel: "Enlace de un video o reel de Facebook",
    note: "Los posts de fotos y los videos privados no funcionan: solo videos y reels públicos.",
  },
  chipKeys: ["example", "noLogin", "hdQuality", "publicOnly"],
  footerDescription:
    "Descargador de videos de Facebook. Sin botones falsos. Pegas una vez, un solo clic real.",
  steps: [
    {
      heading: "Pega el enlace de Facebook",
      body: "En el video o reel que quieres, toca Compartir y luego Copiar enlace. Funciona con los enlaces de video, de reel y de compartir de facebook.com.",
    },
    {
      heading: "Revisa la vista previa",
      body: "La vista previa aparece en un segundo, con el video listo para guardar.",
    },
    {
      heading: "Un solo clic real",
      body: "El video se guarda directo en tu dispositivo con un nombre de archivo limpio. Sin botones falsos, sin rodeos.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "Directo de los servidores de Facebook.",
    figcaption:
      "Copia el enlace del video, pégalo arriba y haz clic en la calidad para guardar el video con un nombre de archivo limpio.",
    ariaLabel:
      "Cómo descargar: copia el enlace del video en Facebook, pégalo en el cuadro y haz clic en HD para guardar el video",
  },
};

export const es: LocaleStrings = {
  twitter: esTwitter,
  tiktok: esTikTok,
  reddit: esReddit,
  instagram: esInstagram,
  facebook: esFacebook,
};

export default es;
