import { webcrypto } from "node:crypto";
import { CryptoDigestAlgorithm, digest, getRandomValues } from "expo-crypto";
import { prepareAuthCrypto } from "../src/features/auth/pkceCrypto.native";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  getRandomValues: jest.fn((array) =>
    require("node:crypto").webcrypto.getRandomValues(array),
  ),
  digest: jest.fn((algorithm, data) =>
    require("node:crypto").webcrypto.subtle.digest(algorithm, data),
  ),
}));

test("Hermes recebe aleatoriedade nativa e SHA-256 para PKCE S256, sem fallback plain", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
  });
  try {
    prepareAuthCrypto();
    const bytes = new Uint8Array(16);
    expect(globalThis.crypto.getRandomValues(bytes)).toBe(bytes);
    expect(getRandomValues).toHaveBeenCalledWith(bytes);
    const data = new TextEncoder().encode("PKCE verifier");
    const actual = await globalThis.crypto.subtle.digest("SHA-256", data);
    const expected = await webcrypto.subtle.digest("SHA-256", data);
    expect(Array.from(new Uint8Array(actual))).toEqual(
      Array.from(new Uint8Array(expected)),
    );
    expect(digest).toHaveBeenCalledWith(CryptoDigestAlgorithm.SHA256, data);
    expect(() => globalThis.crypto.subtle.digest("MD5", data)).toThrow(
      "Unsupported",
    );
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
