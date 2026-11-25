import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCorsOrigins } from "../src/cors";

test("private LAN HTTP origins require explicit development configuration", () => {
  const origins = [
    "http://10.0.0.2:8081",
    "http://192.168.1.20:8081",
    "http://172.16.0.2:8081",
    "http://172.31.255.254:8081",
  ];
  assert.deepEqual(parseCorsOrigins(origins.join(","), "development"), origins);
  for (const environment of [undefined, "test", "production"])
    for (const origin of origins)
      assert.throws(() => parseCorsOrigins(origin, environment));
  for (const environment of [undefined, "development", "test", "production"]) {
    assert.deepEqual(parseCorsOrigins(undefined, environment), [
      "http://localhost:8081",
      "http://127.0.0.1:8081",
    ]);
    assert.deepEqual(parseCorsOrigins("https://example.test", environment), [
      "https://example.test",
    ]);
  }
});

test("CORS origins reject public HTTP, wildcard hosts, wildcard bindings and non-origin URLs", () => {
  for (const origin of [
    "*",
    "https://*",
    "https://*.example.test",
    "http://0.0.0.0:8081",
    "https://0.0.0.0:8081",
    "http://8.8.8.8:8081",
    "http://172.15.255.255:8081",
    "http://172.32.0.1:8081",
    "http://192.169.0.1:8081",
    "http://10.999.0.1:8081",
    "http://10.example.test:8081",
    "http://192.168.1.20:8081/",
    "http://192.168.1.20:8081/invite",
    "http://192.168.1.20:8081?other=1",
    "http://192.168.1.20:8081#token=secret",
    "http://user:password@192.168.1.20:8081",
    "http://192.168.1.20:8081,",
  ])
    assert.throws(() => parseCorsOrigins(origin, "development"), origin);
});
