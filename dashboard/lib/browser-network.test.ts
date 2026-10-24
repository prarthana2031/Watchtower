import { describe, expect, it } from "vitest";
import { isBlockedBrowserAddress } from "./browser-network";

describe("browser network address filtering", () => {
  it("allows public IPv4 addresses without matching IPv4-mapped IPv6 ranges", () => {
    expect(isBlockedBrowserAddress("172.66.147.243")).toBe(false);
  });

  it("blocks private, mapped, and non-routable addresses", () => {
    expect(isBlockedBrowserAddress("172.17.1.1")).toBe(true);
    expect(isBlockedBrowserAddress("::ffff:ac42:93f3")).toBe(true);
    expect(isBlockedBrowserAddress("2606:4700:10::ac42:93f3")).toBe(false);
  });
});
