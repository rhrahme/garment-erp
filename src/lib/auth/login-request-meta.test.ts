import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientIpFromHeaders, describeLoginDevice } from "./login-request-meta.ts";

describe("clientIpFromHeaders", () => {
  it("uses the first x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" });
    assert.equal(clientIpFromHeaders(headers), "203.0.113.10");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.7" });
    assert.equal(clientIpFromHeaders(headers), "198.51.100.7");
  });
});

describe("describeLoginDevice", () => {
  it("labels Chrome on Windows", () => {
    assert.equal(
      describeLoginDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"
      ),
      "Chrome on Windows"
    );
  });

  it("labels Safari on Mac", () => {
    assert.equal(
      describeLoginDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15"
      ),
      "Safari on Mac"
    );
  });
});
