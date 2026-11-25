import { isIP } from "node:net";

/** LAN HTTP is an explicit development opt-in; matching still uses the full origin. */
export function parseCorsOrigins(value?: string, environment?: string) {
  const origins = (
    value ?? "http://localhost:8081,http://127.0.0.1:8081"
  ).split(",");
  const invalid = origins.some((origin) => {
    try {
      const url = new URL(origin);
      const privateIPv4 =
        isIP(url.hostname) === 4 &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
      return (
        url.origin !== origin ||
        origin.includes("*") ||
        url.hostname === "0.0.0.0" ||
        (url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ||
              (environment === "development" && privateIPv4))
          ))
      );
    } catch {
      return true;
    }
  });
  if (invalid)
    throw new Error(
      "CORS_ORIGINS must contain explicit HTTPS, loopback or private development origins",
    );
  return origins;
}
