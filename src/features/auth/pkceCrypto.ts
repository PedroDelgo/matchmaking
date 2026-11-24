/** Web auth requires a secure browser context, including loopback development. */
export function prepareAuthCrypto() {
  if (
    typeof globalThis.crypto?.getRandomValues !== "function" ||
    typeof globalThis.crypto?.subtle?.digest !== "function" ||
    typeof TextEncoder === "undefined"
  )
    throw new Error("Secure PKCE is unavailable in this environment.");
}
