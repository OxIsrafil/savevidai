import { expect, test } from "vitest";
import {
  countryName,
  DASH,
  formatAgo,
  formatBucket,
  formatClock,
  formatCompact,
  formatCount,
  formatDay,
  formatHour,
  formatHourRange,
  formatPeak,
  formatPercent,
  formatRatio,
  formatShare,
  formatSpan,
  formatWhole,
  languageLabel,
  outcomeLabel,
  pageLabel,
  platformName,
  qualityLabel,
  sourceLabel,
  utcMidnightLocal,
} from "./format";

test("counts use thousands separators, compact only for the axis", () => {
  expect(formatCount(0)).toBe("0");
  expect(formatCount(1742)).toBe("1,742");
  expect(formatCount(1234567)).toBe("1,234,567");
  expect(formatCompact(950)).toBe("950");
  expect(formatCompact(1234)).toBe("1.2K");
  expect(formatCompact(3400000)).toBe("3.4M");
});

test("percents: one decimal below 10%, whole numbers from 10%, 0 stays 0%", () => {
  expect(formatPercent(0)).toBe("0%");
  expect(formatPercent(0.0563)).toBe("5.6%");
  expect(formatPercent(0.02)).toBe("2.0%");
  expect(formatPercent(0.0999)).toBe("10.0%");
  expect(formatPercent(0.1)).toBe("10%");
  expect(formatPercent(0.9100284)).toBe("91%");
  expect(formatPercent(0.996)).toBe("100%");
  expect(formatPercent(1)).toBe("100%");
  expect(formatPercent(Number.NaN)).toBe("0%");
});

test("a null ratio renders a dash", () => {
  expect(DASH).toBe("-");
  expect(formatShare(null)).toBe("-");
  expect(formatShare(0.2641)).toBe("26%");
  expect(formatRatio(null)).toBe("-");
  expect(formatRatio(1.326)).toBe("1.3");
  expect(formatRatio(12)).toBe("12.0");
  expect(formatWhole(null)).toBe("-");
  expect(formatWhole(261)).toBe("261");
  expect(formatWhole(1566.4)).toBe("1,566");
});

test("dates read as Sep 17, hours as 14:00, buckets pick by type", () => {
  expect(formatDay("2026-09-17")).toBe("Sep 17");
  expect(formatDay("2026-12-03")).toBe("Dec 3");
  expect(formatDay("garbage")).toBe("garbage");
  expect(formatHour(0)).toBe("00:00");
  expect(formatHour(14)).toBe("14:00");
  expect(formatHourRange(14)).toBe("14:00 to 15:00");
  expect(formatHourRange(23)).toBe("23:00 to 00:00");
  expect(formatBucket("2026-09-20")).toBe("Sep 20");
  expect(formatBucket(9)).toBe("09:00");
});

test("peak note, span line and clock", () => {
  expect(formatPeak({ day: "2026-09-20", time: "21:15" })).toBe("Sep 20 at 21:15");
  expect(formatSpan({ start: "2026-09-17", end: "2026-09-23" })).toBe("Sep 17 to Sep 23, your local time");
  expect(formatSpan({ start: "2026-09-23", end: "2026-09-23" })).toBe("Sep 23, your local time");
  expect(formatClock(new Date(2026, 8, 23, 14, 2))).toBe("14:02");
  expect(formatClock(new Date(2026, 8, 23, 9, 7))).toBe("09:07");
});

test("formatAgo: just now under 1, minutes under 60, then hours", () => {
  expect(formatAgo(0)).toBe("just now");
  expect(formatAgo(0.9)).toBe("just now");
  expect(formatAgo(1)).toBe("1 min ago");
  expect(formatAgo(12)).toBe("12 min ago");
  expect(formatAgo(59)).toBe("59 min ago");
  expect(formatAgo(60)).toBe("1 h ago");
  expect(formatAgo(190)).toBe("3 h ago");
});

test("utcMidnightLocal turns a tz offset into the local clock time of midnight UTC", () => {
  expect(utcMidnightLocal(360)).toBe("06:00");
  expect(utcMidnightLocal(0)).toBe("00:00");
  expect(utcMidnightLocal(-300)).toBe("19:00");
  expect(utcMidnightLocal(330)).toBe("05:30");
  expect(utcMidnightLocal(-570)).toBe("14:30");
});

test("countryName uses the English region name and falls back to the code", () => {
  expect(countryName("BD")).toBe("Bangladesh");
  expect(countryName("US")).toBe("United States");
  expect(countryName("unknown")).toBe("unknown");
  expect(countryName("")).toBe("");
});

test("labels for platforms, qualities, languages, pages, sources and outcomes", () => {
  expect(platformName("twitter")).toBe("X (Twitter)");
  expect(platformName("tiktok")).toBe("TikTok");
  expect(platformName("reddit")).toBe("Reddit");
  expect(platformName("instagram")).toBe("Instagram");
  expect(platformName("facebook")).toBe("Facebook");
  expect(platformName("vimeo")).toBe("vimeo");
  expect(qualityLabel("1080p")).toBe("1080p");
  expect(qualityLabel("hd")).toBe("HD");
  expect(qualityLabel("sd")).toBe("SD");
  expect(qualityLabel("photo")).toBe("Photo");
  expect(qualityLabel("album")).toBe("Album");
  expect(qualityLabel("sound")).toBe("Audio");
  expect(qualityLabel("video")).toBe("Video");
  expect(languageLabel("en")).toBe("English");
  expect(languageLabel("es")).toBe("Spanish");
  expect(languageLabel("hi")).toBe("Hindi");
  expect(languageLabel("unknown")).toBe("language not recorded");
  expect(pageLabel("twitter", "es")).toBe("X (Twitter), Spanish");
  expect(pageLabel("tiktok", "unknown")).toBe("TikTok, language not recorded");
  expect(sourceLabel("direct")).toBe("Direct");
  expect(sourceLabel("search")).toBe("Search");
  expect(sourceLabel("social")).toBe("Social");
  expect(sourceLabel("referral")).toBe("Other sites");
  expect(sourceLabel("internal")).toBe("Between pages");
  expect(outcomeLabel("ok")).toBe("Worked");
  expect(outcomeLabel("not_found")).toBe("Deleted or missing");
  expect(outcomeLabel("invalid_url")).toBe("Not a supported link");
  expect(outcomeLabel("no_video")).toBe("No video in the post");
  expect(outcomeLabel("private_or_restricted")).toBe("Private or restricted");
  expect(outcomeLabel("upstream_error")).toBe("Resolver error");
  expect(outcomeLabel("unsupported_post")).toBe("Unsupported post");
  expect(outcomeLabel("not_configured")).toBe("Not set up");
  expect(outcomeLabel("weird")).toBe("weird");
});
