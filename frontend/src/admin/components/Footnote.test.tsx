import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Footnote } from "./Footnote";

test("explains the daily visitor id with the local time of midnight UTC, the retention, the refresh, and the DB-IP link", () => {
  render(<Footnote tz={360} />);
  expect(screen.getByText(/Visitors are counted once a day: the anonymous ID resets at midnight UTC \(06:00 your time\), so someone active across that moment counts twice\./)).toBeInTheDocument();
  expect(screen.getByText(/Times are your local time\. Data is kept 90 days, so the 90-day range has nothing earlier to compare with\. Refreshes every 30 seconds while this tab is open\./)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "IP Geolocation by DB-IP" })).toHaveAttribute("href", "https://db-ip.com");
});
