import { describe, expect, it } from "vitest";
import { prepareState as prepareOtp } from "../src/shared/otp/state";
import { generateOtp, normalizePeriod } from "../src/shared/otp/otp";
import { parseOtpauthUri } from "../src/shared/otp/otpauth";
import { prepareState as prepareLinks } from "../src/shared/link/state";
import { urlsOf } from "../src/shared/link/core";

describe("desktop backup compatibility", () => {
  it("reads a FunOTP backup and computes the RFC 4226 sample", async () => {
    const account = parseOtpauthUri(
      "otpauth://hotp/Example:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=0",
    );
    const { state } = prepareOtp({
      version: 1,
      groups: [],
      accounts: [account],
    });
    expect(state.accounts[0].name).toBe("alice");
    expect(
      await generateOtp({ ...state.accounts[0], digits: 6, counter: 0 }),
    ).toBe("755224");
  });

  it("keeps fractional OTP periods within the supported range", () => {
    expect(normalizePeriod(0.5)).toBe(1);
  });

  it("reads FunLink categories and rejects unsafe bookmark URLs", () => {
    const { state, dropped } = prepareLinks({
      version: 1,
      categories: [{ id: "work", name: "Work", parentId: "" }],
      bookmarks: [
        {
          id: "a",
          title: "Docs",
          url: "https://example.com",
          categoryId: "work",
        },
        { id: "b", title: "Bad", url: "javascript:alert(1)" },
      ],
    });
    expect(dropped).toBe(1);
    expect(state.bookmarks[0].categoryIds).toEqual(["work"]);
  });

  it("keeps multiple safe URLs available for one FunLink bookmark", () => {
    expect(
      urlsOf({
        id: "a",
        title: "Docs",
        url: "https://example.com",
        urls: ["https://docs.example.com", "javascript:alert(1)"],
      }),
    ).toEqual(["https://example.com", "https://docs.example.com"]);
  });
});
