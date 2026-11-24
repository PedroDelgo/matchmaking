import { CryptoDigestAlgorithm, digest, getRandomValues } from "expo-crypto";

/** Supply only Auth's missing WebCrypto operations with native cryptography.
 * Never permit the SDK's Math.random / plain-PKCE fallback on Hermes.
 */
export function prepareAuthCrypto() {
  const crypto = globalThis.crypto ?? {};
  if (typeof crypto.getRandomValues !== "function")
    Object.defineProperty(crypto, "getRandomValues", {
      value: getRandomValues,
    });
  if (typeof crypto.subtle?.digest !== "function")
    Object.defineProperty(crypto, "subtle", {
      value: {
        digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const name =
            typeof algorithm === "string" ? algorithm : algorithm.name;
          if (name !== "SHA-256") throw new Error("Unsupported Auth digest.");
          return digest(CryptoDigestAlgorithm.SHA256, data);
        },
      },
    });
  if (!globalThis.crypto)
    Object.defineProperty(globalThis, "crypto", {
      value: crypto,
      configurable: true,
    });
  if (typeof TextEncoder === "undefined")
    throw new Error("Secure PKCE requires TextEncoder.");
}
