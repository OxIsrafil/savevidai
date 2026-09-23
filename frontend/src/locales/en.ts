/**
 * English string table: the extraction of every user-visible literal the pages
 * ship today, and the default every component falls back to.
 *
 * Copy is character-identical to what the live en pages render (React source and
 * the HTML shells). Do not edit a string here without editing its twin in the
 * matching shell: the parity tests compare the two.
 */

import type {
  LocaleStrings,
  PageStrings,
  SharedStrings,
  SharedSvgStrings,
} from "./types";

export const enShared: SharedStrings = {
  locale: "en",
  prefix: "",

  nav: {
    brand: "SaveVid AI",
    twitter: "Twitter/X",
    tiktok: "TikTok",
    reddit: "Reddit",
    instagram: "Instagram",
    facebook: "Facebook",
    downloadButton: "Download",
  },

  theme: {
    toLight: "Switch to light mode",
    toDark: "Switch to dark mode",
  },

  input: {
    submit: "Fetch",
    fetched: "Fetched",
  },

  chips: {
    example: "▶ try an example",
    noLogin: "no login",
    noWatermark: "no watermark",
    originalQuality: "original quality",
    withAudio: "with audio",
    hdQuality: "hd quality",
    publicOnly: "public posts only",
  },

  platform: {
    navLabel: "Choose a platform",
    twitter: "Twitter / X",
    tiktok: "TikTok",
    reddit: "Reddit",
    instagram: "Instagram",
    facebook: "Facebook",
    srSuffix: " downloader",
  },

  preview: {
    videoSingle: "Video",
    videoN: "Video {n}",
    gifBadge: "GIF",
  },

  quality: {
    saved: "Saved",
    downloading: "downloading",
    retry: "retry",
    hdChip: "HD",
  },

  photos: {
    sectionLabel: "Photos",
    saveAll: "Save all",
    sound: "Sound",
    soundSaved: "Sound saved",
    soundRetry: "Retry sound",
    savePhotoN: "Save photo {n}",
  },

  followPopup: {
    title: "Follow me on X",
    line: "New tools and updates, posted here first.",
    follow: "Follow {handle}",
    newTab: "(opens in a new tab)",
    download: "Download",
    close: "Close",
  },

  errors: {
    network: "Network error. Check your connection and try again.",
    serverUnreachable: "Can't reach the SaveVid server right now. Try again in a moment.",
    generic: "Something went wrong. Try again.",
  },

  lang: {
    navLabel: "Language",
    en: "English",
    es: "Español",
    hi: "हिन्दी",
  },

  section: {
    howItWorksKicker: "how it works",
    howItWorksTitle: "Three steps, no accounts",
    questionsKicker: "questions",
    faqTitle: "Frequently asked questions",
  },

  footer: {
    brand: "SaveVid AI",
    linksLabel: "SaveVid AI links",
    platformsLabel: "All downloaders",
    xLink: "X · @israfill",
    builtBy: "built by",
    copyright: "© 2026 SaveVid AI",
  },

  footerNav: {
    twitter: "Twitter/X video downloader",
    tiktok: "TikTok video downloader",
    reddit: "Reddit video downloader",
    instagram: "Instagram reel downloader",
    facebook: "Facebook video downloader",
  },
};

// Section 4.1: the three labels every HowToVisual shares.
const svgShared: SharedSvgStrings = {
  copyLink: "Copy link",
  fetch: "Fetch",
  savedToDevice: "saved to your device",
};

export const enTwitter: PageStrings = {
  ...enShared,
  platformKey: "twitter",
  meta: {
    title: "Twitter/X Video Downloader - Free, Fast, Instant | SaveVid AI",
    description:
      "Download Twitter/X videos and GIFs in original quality. No fake download buttons, no forced redirects. Free and instant.",
    ogDescription: "Paste a post link, pick a quality, done. No fake buttons, one real click.",
  },
  hero: {
    h1a: "Twitter/X Video",
    h1b: "Downloader",
    lede: "Paste tweet URL and get the video in 2 seconds.",
    placeholder: "Paste a Twitter/X post link",
    inputAriaLabel: "Twitter/X post link",
    note: "Straight from Twitter's CDN. No fake buttons, one real click.",
  },
  chipKeys: ["example", "noLogin", "noWatermark", "originalQuality"],
  footerDescription: "Twitter/X video downloader. No fake buttons. One paste, every quality.",
  steps: [
    {
      heading: "Copy the post link",
      body: "On the post with the video, tap Share, then Copy link. Works with x.com, twitter.com, and mirror links from Discord.",
    },
    {
      heading: "Paste it above",
      body: "The preview appears in about a second, with every available quality and its file size listed.",
    },
    {
      heading: "Pick a size",
      body: "The video saves straight from Twitter's CDN to your device with a clean filename. No watermark, ever.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "No watermark. Straight from Twitter's CDN.",
    figcaption:
      "Copy the post link, paste it above, pick a quality, and the video saves with a clean filename.",
    ariaLabel:
      "How to download: copy the post link from Twitter, paste it in the box, then pick a quality to save the video",
  },
};

export const enTikTok: PageStrings = {
  ...enShared,
  platformKey: "tiktok",
  meta: {
    title: "TikTok Video Downloader - No Watermark, Free | SaveVid AI",
    description:
      "Download TikTok videos without the watermark, in original quality. No fake download buttons, no forced redirects. Free and instant.",
    ogDescription:
      "Paste a TikTok link, get it without the watermark, in seconds. No fake buttons, one real click.",
  },
  hero: {
    h1a: "TikTok Video",
    h1b: "Downloader",
    lede: "Paste a TikTok link, get it without the watermark, in seconds.",
    placeholder: "Paste a TikTok video link",
    inputAriaLabel: "TikTok video link",
    note: "Clean file, no watermark. No fake buttons, one real click.",
  },
  chipKeys: ["example", "noLogin", "noWatermark", "originalQuality"],
  footerDescription: "TikTok video downloader. No fake buttons. One paste, no watermark.",
  steps: [
    {
      heading: "Open the TikTok post",
      body: "On the video you want, tap Share, then Copy link. Works with tiktok.com links and the short vm.tiktok.com share links.",
    },
    {
      heading: "Paste it above",
      body: "The preview appears in about a second, with the video ready to save.",
    },
    {
      heading: "Download",
      body: "The video saves straight to your device with a clean filename. No watermark, ever.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "No watermark. Straight from the source.",
    figcaption:
      "Copy the post link, paste it above, pick a quality, and the video saves with a clean filename.",
    ariaLabel:
      "How to download: copy the post link from TikTok, paste it in the box, then pick a quality to save the video",
  },
};

export const enReddit: PageStrings = {
  ...enShared,
  platformKey: "reddit",
  meta: {
    title: "Reddit Video Downloader - With Audio, Free | SaveVid AI",
    description:
      "Download Reddit videos with the audio merged in, in original quality. No fake download buttons, no forced redirects. Free and instant.",
    ogDescription:
      "Paste a Reddit post link, get the video with audio, in seconds. No fake buttons, one real click.",
  },
  hero: {
    h1a: "Reddit Video",
    h1b: "Downloader",
    lede: "Paste a Reddit post link, get the video with audio, in seconds.",
    placeholder: "Paste a Reddit post link",
    inputAriaLabel: "Reddit post link",
    note: "Video and audio merged into one file. No fake buttons, one real click.",
  },
  chipKeys: ["example", "noLogin", "withAudio", "originalQuality"],
  footerDescription: "Reddit video downloader. No fake buttons. One paste, audio merged in.",
  steps: [
    {
      heading: "Open the Reddit post",
      body: "On the post you want, tap Share, then Copy link. Works with reddit.com links and the short redd.it share links.",
    },
    {
      heading: "Paste it above",
      body: "The preview appears in about a second, with the video ready to save.",
    },
    {
      heading: "Download",
      body: "The video saves straight to your device with the audio merged in and a clean filename.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "With audio. Straight from the source.",
    figcaption:
      "Copy the post link, paste it above, pick a quality, and the video saves with a clean filename.",
    ariaLabel:
      "How to download: copy the post link from Reddit, paste it in the box, then pick a quality to save the video",
  },
};

export const enInstagram: PageStrings = {
  ...enShared,
  platformKey: "instagram",
  meta: {
    title: "Instagram Reel Downloader - Fast, Free, HD | SaveVid AI",
    description:
      "Download Instagram reels and videos in HD. No fake download buttons, no forced redirects. Free and instant.",
    ogDescription:
      "Paste an Instagram link, get the video in seconds. No fake buttons, one real click.",
  },
  hero: {
    h1a: "Instagram Reel",
    h1b: "Downloader",
    lede: "Paste an Instagram link, get the video in HD. No fake buttons, one real click.",
    placeholder: "Paste an Instagram reel or post link",
    inputAriaLabel: "Instagram reel or post link",
    note: "Carousel posts save the first photo or video only, for now.",
  },
  chipKeys: ["example", "noLogin", "hdQuality", "publicOnly"],
  footerDescription: "Instagram reel downloader. No fake buttons. One paste, one real click.",
  steps: [
    {
      heading: "Paste the Instagram link",
      body: "On the reel or post you want, tap Share, then Copy link. Works with reel and post links from instagram.com.",
    },
    {
      heading: "Pick your file",
      body: "The preview appears in about a second, with the video or photo ready to save.",
    },
    {
      heading: "One real click",
      body: "The file saves straight to your device with a clean filename. No fake buttons, no detours.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "Straight from Instagram's servers.",
    figcaption:
      "Copy the reel link, paste it above, then click the quality to save the video with a clean filename.",
    ariaLabel:
      "How to download: copy the reel link from Instagram, paste it in the box, then click HD to save the video",
  },
};

export const enFacebook: PageStrings = {
  ...enShared,
  platformKey: "facebook",
  meta: {
    title: "Facebook Video Downloader - Fast, Free, HD | SaveVid AI",
    description:
      "Download Facebook videos and reels in HD. No fake download buttons, no forced redirects. Free and instant.",
    ogDescription:
      "Paste a Facebook link, get the video in seconds. No fake buttons, one real click.",
  },
  hero: {
    h1a: "Facebook Video",
    h1b: "Downloader",
    lede: "Paste a Facebook link, get the video in HD. No fake buttons, one real click.",
    placeholder: "Paste a Facebook video or reel link",
    inputAriaLabel: "Facebook video or reel link",
    note: "Photo posts and private videos are not supported: public videos and reels only.",
  },
  chipKeys: ["example", "noLogin", "hdQuality", "publicOnly"],
  footerDescription: "Facebook video downloader. No fake buttons. One paste, one real click.",
  steps: [
    {
      heading: "Paste the Facebook link",
      body: "On the video or reel you want, tap Share, then Copy link. Works with facebook.com video, reel, and share links.",
    },
    {
      heading: "Check the preview",
      body: "The preview appears in about a second, with the video ready to save.",
    },
    {
      heading: "One real click",
      body: "The video saves straight to your device with a clean filename. No fake buttons, no detours.",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "Straight from Facebook's servers.",
    figcaption:
      "Copy the video link, paste it above, then click the quality to save the video with a clean filename.",
    ariaLabel:
      "How to download: copy the video link from Facebook, paste it in the box, then click HD to save the video",
  },
};

export const en: LocaleStrings = {
  twitter: enTwitter,
  tiktok: enTikTok,
  reddit: enReddit,
  instagram: enInstagram,
  facebook: enFacebook,
};

export default en;
