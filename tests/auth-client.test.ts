jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ auth: {} })),
  processLock: jest.fn(),
}));
jest.mock("../src/features/auth/sessionStorage", () => ({
  sessionStorage: {},
}));
jest.mock("../src/features/auth/pkceCrypto", () => ({
  prepareAuthCrypto: jest.fn(),
}));
jest.mock("react-native-url-polyfill/auto", () => ({}));

const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
afterEach(() => {
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined)
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
});

function configure(url?: string, key?: string) {
  if (url === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = url;
  if (key === undefined)
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
  let client!: typeof import("../src/features/auth/client");
  let sdk!: typeof import("@supabase/supabase-js");
  jest.isolateModules(() => {
    client = require("../src/features/auth/client");
    sdk = require("@supabase/supabase-js");
    jest.mocked(sdk.createClient).mockClear();
  });
  return { ...client, sdk };
}

test("ausência de configuração mantém o modo local e rejeita chaves administrativas", () => {
  expect(configure().getAuthClient()).toBeNull();
  const privateJwt = `header.${btoa(JSON.stringify({ role: "service_role" }))}.test-signature`;
  for (const key of ["sb_secret_test-only", privateJwt, "not-a-public-key"]) {
    const configured = configure("http://127.0.0.1:54321", key);
    expect(configured.getAuthClient()).toBeNull();
    expect(configured.sdk.createClient).not.toHaveBeenCalled();
    expect(configured.getAuthConfigurationError()).toContain(
      "continuar sem conta",
    );
  }
});

test("cliente único usa namespace separado, PKCE e transporte seguro fora da LAN de desenvolvimento", () => {
  for (const url of [
    "http://auth.example.test",
    "https://user:password@example.test",
    "https://example.test?secret=value",
  ]) {
    const invalid = configure(url, "sb_publishable_test-only");
    expect(invalid.getAuthClient()).toBeNull();
    expect(invalid.sdk.createClient).not.toHaveBeenCalled();
  }
  const configured = configure(
    "http://127.0.0.1:54321",
    "sb_publishable_test-only",
  );
  const first = configured.getAuthClient();
  expect(first).toBeTruthy();
  expect(configured.getAuthClient()).toBe(first);
  expect(configured.sdk.createClient).toHaveBeenCalledTimes(1);
  expect(configured.sdk.createClient).toHaveBeenCalledWith(
    "http://127.0.0.1:54321",
    "sb_publishable_test-only",
    expect.objectContaining({
      auth: expect.objectContaining({
        storageKey: expect.stringMatching(/^matchmaking\.auth\.v1\./),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      }),
    }),
  );
});
