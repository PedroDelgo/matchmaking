import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import {
  createClient,
  processLock,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { sessionStorage } from "./sessionStorage";
import { prepareAuthCrypto } from "./pkceCrypto";

let client: SupabaseClient | null | undefined;
let configurationError: string | null = null;

export function getAuthClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publicKey) return (client = null);
  try {
    prepareAuthCrypto();
    const endpoint = new URL(url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      endpoint.hostname,
    );
    const privateNetwork = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      endpoint.hostname,
    );
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      (endpoint.protocol !== "https:" &&
        !(
          endpoint.protocol === "http:" &&
          (loopback || (__DEV__ && privateNetwork))
        ))
    )
      throw new Error("Invalid endpoint");
    if (publicKey.startsWith("sb_secret_"))
      throw new Error("Private key refused");
    if (!publicKey.startsWith("sb_publishable_")) {
      const payload = publicKey.split(".")[1];
      if (
        !payload ||
        JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role !==
          "anon"
      )
        throw new Error("Only public keys are allowed");
    }
    const normalized = endpoint.toString().replace(/\/$/, "");
    const namespace = Array.from(normalized)
      .map((c) => c.codePointAt(0)!.toString(16))
      .join("-");
    client = createClient(normalized, publicKey, {
      auth: {
        storage: sessionStorage,
        storageKey: `matchmaking.auth.v1.${namespace}`,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        ...(Platform.OS === "web" ? {} : { lock: processLock }),
      },
    });
    return client;
  } catch {
    configurationError =
      "A conexão com sua conta ainda não foi configurada neste ambiente. Você pode continuar sem conta.";
    return (client = null);
  }
}

export function getAuthConfigurationError() {
  getAuthClient();
  return configurationError;
}
