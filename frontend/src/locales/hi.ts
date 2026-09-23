/**
 * Hindi string table (Devanagari, neutral-polite aap imperative).
 *
 * Every value is copied character-for-character from section 2, 3 and 4 of
 * docs/superpowers/specs/2026-08-01-i18n-translations.md, which is the single
 * source of truth for hi copy. Do not retranslate a string here: fix the doc
 * first, then mirror the change. Platform names, OS-UI labels (Share, Copy
 * link, Files, Safari) and format tokens stay in Latin script by spec rule.
 * Visible FAQ entries are deliberately absent: they live in the hi HTML shells,
 * which stay their single source of truth.
 */

import type {
  LocaleStrings,
  PageStrings,
  SharedStrings,
  SharedSvgStrings,
} from "./types";

export const hiShared: SharedStrings = {
  locale: "hi",
  prefix: "/hi",

  nav: {
    brand: "SaveVid AI",
    twitter: "Twitter/X",
    tiktok: "TikTok",
    reddit: "Reddit",
    instagram: "Instagram",
    facebook: "Facebook",
    downloadButton: "डाउनलोड",
  },

  theme: {
    toLight: "लाइट मोड पर जाएँ",
    toDark: "डार्क मोड पर जाएँ",
  },

  input: {
    submit: "पाएँ",
    fetched: "मिल गया",
  },

  chips: {
    example: "▶ एक उदाहरण देखें",
    noLogin: "कोई लॉगिन नहीं",
    noWatermark: "कोई वॉटरमार्क नहीं",
    originalQuality: "ओरिजिनल क्वालिटी",
    withAudio: "ऑडियो के साथ",
    hdQuality: "HD क्वालिटी",
    publicOnly: "सिर्फ़ पब्लिक पोस्ट",
  },

  platform: {
    navLabel: "प्लेटफ़ॉर्म चुनें",
    twitter: "Twitter / X",
    tiktok: "TikTok",
    reddit: "Reddit",
    instagram: "Instagram",
    facebook: "Facebook",
    srSuffix: " डाउनलोडर",
  },

  preview: {
    videoSingle: "वीडियो",
    videoN: "वीडियो {n}",
    gifBadge: "GIF",
  },

  quality: {
    saved: "सेव हो गया",
    downloading: "डाउनलोड जारी",
    retry: "दोबारा",
    hdChip: "HD",
  },

  photos: {
    sectionLabel: "फ़ोटो",
    saveAll: "सब सेव करें",
    sound: "ऑडियो",
    soundSaved: "ऑडियो सेव हो गया",
    soundRetry: "ऑडियो दोबारा",
    savePhotoN: "फ़ोटो {n} सेव करें",
  },

  // `line` avoids a first-person verb on purpose: Hindi verbs carry gender,
  // and it must not assume one. Doc section 2.16.
  followPopup: {
    title: "X पर मुझे फ़ॉलो करें",
    line: "नए टूल और अपडेट, सबसे पहले यहाँ।",
    follow: "{handle} को फ़ॉलो करें",
    newTab: "(नए टैब में खुलता है)",
    download: "डाउनलोड करें",
    close: "बंद करें",
  },

  errors: {
    network: "नेटवर्क एरर। अपना कनेक्शन जाँचें और दोबारा कोशिश करें।",
    serverUnreachable:
      "अभी SaveVid सर्वर से कनेक्ट नहीं हो पा रहा। थोड़ी देर में दोबारा कोशिश करें।",
    generic: "कुछ गड़बड़ हो गई। दोबारा कोशिश करें।",
  },

  lang: {
    navLabel: "भाषा",
    en: "English",
    es: "Español",
    hi: "हिन्दी",
  },

  section: {
    howItWorksKicker: "यह कैसे काम करता है",
    howItWorksTitle: "तीन स्टेप, कोई अकाउंट नहीं",
    questionsKicker: "सवाल",
    faqTitle: "अक्सर पूछे जाने वाले सवाल",
  },

  footer: {
    brand: "SaveVid AI",
    linksLabel: "SaveVid AI लिंक",
    platformsLabel: "सभी डाउनलोडर",
    xLink: "X · @israfilv2",
    // Hindi is head-final, so this is a POSTfix: the hi shell must render the
    // @israfilv2 link and then this text node ("<a>@israfilv2</a> ने बनाया"),
    // the reverse of the en/es order. Doc section 2.14.
    builtBy: "ने बनाया",
    copyright: "© 2026 SaveVid AI",
  },

  footerNav: {
    twitter: "Twitter/X वीडियो डाउनलोडर",
    tiktok: "TikTok वीडियो डाउनलोडर",
    reddit: "Reddit वीडियो डाउनलोडर",
    instagram: "Instagram रील डाउनलोडर",
    facebook: "Facebook वीडियो डाउनलोडर",
  },
};

// Section 4.1: the three labels every HowToVisual shares.
const svgShared: SharedSvgStrings = {
  copyLink: "Copy link",
  fetch: "पाएँ",
  savedToDevice: "आपके डिवाइस में सेव",
};

export const hiTwitter: PageStrings = {
  ...hiShared,
  platformKey: "twitter",
  meta: {
    title: "Twitter/X वीडियो डाउनलोडर - फ़्री, तेज़, तुरंत | SaveVid AI",
    description:
      "Twitter/X के वीडियो और GIF ओरिजिनल क्वालिटी में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।",
    ogDescription:
      "पोस्ट का लिंक पेस्ट करें, क्वालिटी चुनें, हो गया। कोई नकली बटन नहीं।",
  },
  hero: {
    h1a: "Twitter/X वीडियो",
    h1b: "डाउनलोडर",
    lede: "ट्वीट का URL पेस्ट करें और 2 सेकंड में वीडियो पाएँ।",
    placeholder: "Twitter/X पोस्ट का लिंक पेस्ट करें",
    inputAriaLabel: "Twitter/X पोस्ट का लिंक",
    note: "सीधे Twitter के CDN से। कोई नकली बटन नहीं।",
  },
  chipKeys: ["example", "noLogin", "noWatermark", "originalQuality"],
  footerDescription: "Twitter/X वीडियो डाउनलोडर। कोई नकली बटन नहीं। एक पेस्ट, हर क्वालिटी।",
  steps: [
    {
      heading: "पोस्ट का लिंक कॉपी करें",
      body: "जिस पोस्ट में वीडियो है, उस पर Share दबाएँ, फिर Copy link। x.com, twitter.com और Discord के मिरर लिंक, सब चलते हैं।",
    },
    {
      heading: "उसे ऊपर पेस्ट करें",
      body: "करीब एक सेकंड में प्रीव्यू आ जाता है, हर उपलब्ध क्वालिटी और उसकी फ़ाइल साइज़ के साथ।",
    },
    {
      heading: "साइज़ चुनें",
      body: "वीडियो सीधे Twitter के CDN से आपके डिवाइस में सेव होता है, साफ़ फ़ाइल नाम के साथ। वॉटरमार्क कभी नहीं।",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "कोई वॉटरमार्क नहीं। सीधे Twitter के CDN से।",
    figcaption:
      "पोस्ट का लिंक कॉपी करें, ऊपर पेस्ट करें, क्वालिटी चुनें, और वीडियो साफ़ फ़ाइल नाम के साथ सेव हो जाता है।",
    ariaLabel:
      "कैसे डाउनलोड करें: Twitter से पोस्ट का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए क्वालिटी चुनें",
  },
};

export const hiTikTok: PageStrings = {
  ...hiShared,
  platformKey: "tiktok",
  meta: {
    title: "TikTok वीडियो डाउनलोडर - बिना वॉटरमार्क, फ़्री | SaveVid AI",
    description:
      "TikTok वीडियो बिना वॉटरमार्क, ओरिजिनल क्वालिटी में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।",
    ogDescription:
      "TikTok का लिंक पेस्ट करें, कुछ ही सेकंड में बिना वॉटरमार्क वीडियो पाएँ। कोई नकली बटन नहीं।",
  },
  hero: {
    h1a: "TikTok वीडियो",
    h1b: "डाउनलोडर",
    lede: "TikTok का लिंक पेस्ट करें और कुछ ही सेकंड में बिना वॉटरमार्क वीडियो पाएँ।",
    placeholder: "TikTok वीडियो का लिंक पेस्ट करें",
    inputAriaLabel: "TikTok वीडियो का लिंक",
    note: "साफ़ फ़ाइल, कोई वॉटरमार्क नहीं। कोई नकली बटन नहीं।",
  },
  chipKeys: ["example", "noLogin", "noWatermark", "originalQuality"],
  footerDescription: "TikTok वीडियो डाउनलोडर। कोई नकली बटन नहीं। एक पेस्ट, कोई वॉटरमार्क नहीं।",
  steps: [
    {
      heading: "TikTok पोस्ट खोलें",
      body: "जो वीडियो चाहिए, उस पर Share दबाएँ, फिर Copy link। tiktok.com के लिंक और छोटे vm.tiktok.com शेयर लिंक, दोनों चलते हैं।",
    },
    {
      heading: "उसे ऊपर पेस्ट करें",
      body: "करीब एक सेकंड में प्रीव्यू आ जाता है, वीडियो सेव करने के लिए तैयार।",
    },
    {
      heading: "डाउनलोड करें",
      body: "वीडियो सीधे आपके डिवाइस में सेव होता है, साफ़ फ़ाइल नाम के साथ। वॉटरमार्क कभी नहीं।",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "कोई वॉटरमार्क नहीं। सीधे सोर्स से।",
    figcaption:
      "पोस्ट का लिंक कॉपी करें, ऊपर पेस्ट करें, क्वालिटी चुनें, और वीडियो साफ़ फ़ाइल नाम के साथ सेव हो जाता है।",
    ariaLabel:
      "कैसे डाउनलोड करें: TikTok से पोस्ट का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए क्वालिटी चुनें",
  },
};

export const hiReddit: PageStrings = {
  ...hiShared,
  platformKey: "reddit",
  meta: {
    title: "Reddit वीडियो डाउनलोडर - ऑडियो के साथ, फ़्री | SaveVid AI",
    description:
      "Reddit वीडियो ऑडियो के साथ, ओरिजिनल क्वालिटी में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।",
    ogDescription:
      "Reddit पोस्ट का लिंक पेस्ट करें, कुछ ही सेकंड में ऑडियो के साथ वीडियो पाएँ। कोई नकली बटन नहीं।",
  },
  hero: {
    h1a: "Reddit वीडियो",
    h1b: "डाउनलोडर",
    lede: "Reddit पोस्ट का लिंक पेस्ट करें और कुछ ही सेकंड में ऑडियो के साथ वीडियो पाएँ।",
    placeholder: "Reddit पोस्ट का लिंक पेस्ट करें",
    inputAriaLabel: "Reddit पोस्ट का लिंक",
    note: "वीडियो और ऑडियो एक ही फ़ाइल में। कोई नकली बटन नहीं।",
  },
  chipKeys: ["example", "noLogin", "withAudio", "originalQuality"],
  footerDescription: "Reddit वीडियो डाउनलोडर। कोई नकली बटन नहीं। एक पेस्ट, ऑडियो जुड़ा हुआ।",
  steps: [
    {
      heading: "Reddit पोस्ट खोलें",
      body: "जो पोस्ट चाहिए, उस पर Share दबाएँ, फिर Copy link। reddit.com के लिंक और छोटे redd.it शेयर लिंक, दोनों चलते हैं।",
    },
    {
      heading: "उसे ऊपर पेस्ट करें",
      body: "करीब एक सेकंड में प्रीव्यू आ जाता है, वीडियो सेव करने के लिए तैयार।",
    },
    {
      heading: "डाउनलोड करें",
      body: "वीडियो सीधे आपके डिवाइस में सेव होता है, ऑडियो जुड़ा हुआ और साफ़ फ़ाइल नाम के साथ।",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "ऑडियो के साथ। सीधे सोर्स से।",
    figcaption:
      "पोस्ट का लिंक कॉपी करें, ऊपर पेस्ट करें, क्वालिटी चुनें, और वीडियो साफ़ फ़ाइल नाम के साथ सेव हो जाता है।",
    ariaLabel:
      "कैसे डाउनलोड करें: Reddit से पोस्ट का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए क्वालिटी चुनें",
  },
};

export const hiInstagram: PageStrings = {
  ...hiShared,
  platformKey: "instagram",
  meta: {
    title: "Instagram रील डाउनलोडर - तेज़, फ़्री, HD | SaveVid AI",
    description:
      "Instagram की रील और वीडियो HD में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।",
    ogDescription:
      "Instagram का लिंक पेस्ट करें, कुछ ही सेकंड में वीडियो पाएँ। कोई नकली बटन नहीं।",
  },
  hero: {
    h1a: "Instagram रील",
    h1b: "डाउनलोडर",
    lede: "Instagram का लिंक पेस्ट करें और HD में वीडियो पाएँ। कोई नकली बटन नहीं।",
    placeholder: "Instagram रील या पोस्ट का लिंक पेस्ट करें",
    inputAriaLabel: "Instagram रील या पोस्ट का लिंक",
    note: "फ़िलहाल कैरोसेल पोस्ट से सिर्फ़ पहली फ़ोटो या वीडियो ही सेव होता है।",
  },
  chipKeys: ["example", "noLogin", "hdQuality", "publicOnly"],
  footerDescription: "Instagram रील डाउनलोडर। कोई नकली बटन नहीं।",
  steps: [
    {
      heading: "Instagram का लिंक पेस्ट करें",
      body: "जो रील या पोस्ट चाहिए, उस पर Share दबाएँ, फिर Copy link। instagram.com के रील और पोस्ट, दोनों के लिंक चलते हैं।",
    },
    {
      heading: "अपनी फ़ाइल चुनें",
      body: "करीब एक सेकंड में प्रीव्यू आ जाता है, वीडियो या फ़ोटो सेव करने के लिए तैयार।",
    },
    {
      heading: "कोई नकली बटन नहीं",
      body: "फ़ाइल सीधे आपके डिवाइस में सेव होती है, साफ़ फ़ाइल नाम के साथ।",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "सीधे Instagram के सर्वर से।",
    figcaption:
      "रील का लिंक कॉपी करें, ऊपर पेस्ट करें, फिर क्वालिटी पर क्लिक करके वीडियो साफ़ फ़ाइल नाम के साथ सेव करें।",
    ariaLabel:
      "कैसे डाउनलोड करें: Instagram से रील का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए HD पर क्लिक करें",
  },
};

export const hiFacebook: PageStrings = {
  ...hiShared,
  platformKey: "facebook",
  meta: {
    title: "Facebook वीडियो डाउनलोडर - तेज़, फ़्री, HD | SaveVid AI",
    description:
      "Facebook के वीडियो और रील HD में डाउनलोड करें। कोई नकली डाउनलोड बटन नहीं, कोई ज़बरदस्ती रीडायरेक्ट नहीं। फ़्री और तुरंत।",
    ogDescription:
      "Facebook का लिंक पेस्ट करें, कुछ ही सेकंड में वीडियो पाएँ। कोई नकली बटन नहीं।",
  },
  hero: {
    h1a: "Facebook वीडियो",
    h1b: "डाउनलोडर",
    lede: "Facebook का लिंक पेस्ट करें और HD में वीडियो पाएँ। कोई नकली बटन नहीं।",
    placeholder: "Facebook वीडियो या रील का लिंक पेस्ट करें",
    inputAriaLabel: "Facebook वीडियो या रील का लिंक",
    note: "फ़ोटो पोस्ट और प्राइवेट वीडियो सपोर्ट नहीं हैं: सिर्फ़ पब्लिक वीडियो और रील।",
  },
  chipKeys: ["example", "noLogin", "hdQuality", "publicOnly"],
  footerDescription: "Facebook वीडियो डाउनलोडर। कोई नकली बटन नहीं।",
  steps: [
    {
      heading: "Facebook का लिंक पेस्ट करें",
      body: "जो वीडियो या रील चाहिए, उस पर Share दबाएँ, फिर Copy link। facebook.com के वीडियो, रील और शेयर लिंक, सब चलते हैं।",
    },
    {
      heading: "प्रीव्यू देखें",
      body: "करीब एक सेकंड में प्रीव्यू आ जाता है, वीडियो सेव करने के लिए तैयार।",
    },
    {
      heading: "कोई नकली बटन नहीं",
      body: "वीडियो सीधे आपके डिवाइस में सेव होता है, साफ़ फ़ाइल नाम के साथ।",
    },
  ],
  svg: {
    ...svgShared,
    footerLine: "सीधे Facebook के सर्वर से।",
    figcaption:
      "वीडियो का लिंक कॉपी करें, ऊपर पेस्ट करें, फिर क्वालिटी पर क्लिक करके वीडियो साफ़ फ़ाइल नाम के साथ सेव करें।",
    ariaLabel:
      "कैसे डाउनलोड करें: Facebook से वीडियो का लिंक कॉपी करें, बॉक्स में पेस्ट करें, फिर वीडियो सेव करने के लिए HD पर क्लिक करें",
  },
};

export const hi: LocaleStrings = {
  twitter: hiTwitter,
  tiktok: hiTikTok,
  reddit: hiReddit,
  instagram: hiInstagram,
  facebook: hiFacebook,
};

export default hi;
