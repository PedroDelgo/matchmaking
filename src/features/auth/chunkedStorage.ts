export type SessionKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const chunkCharacters = 384; // At most 1536 UTF-8 bytes, including non-BMP characters.
const maximumChunks = 128;
type Manifest = { version: 1; generation: string; count: number };

function parseManifest(raw: string | null): Manifest | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("generation" in value) ||
    typeof value.generation !== "string" ||
    !/^[a-z0-9-]{1,80}$/.test(value.generation) ||
    !("count" in value) ||
    !Number.isInteger(value.count) ||
    Number(value.count) < 1 ||
    Number(value.count) > maximumChunks
  )
    throw new Error("Armazenamento de sessão inválido.");
  return value as Manifest;
}

/** All underlying values must be encrypted by the supplied native storage. */
export function createChunkedSessionStorage(
  storage: SessionKeyValueStorage,
): SessionKeyValueStorage {
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = pending.then(run, run);
    pending = result.catch(() => undefined);
    return result;
  }
  const chunkKey = (key: string, m: Manifest, index: number) =>
    `${key}.${m.generation}.${index}`;
  async function removeChunks(key: string, manifest: Manifest) {
    await Promise.all(
      Array.from({ length: manifest.count }, (_, i) =>
        storage.removeItem(chunkKey(key, manifest, i)),
      ),
    );
  }
  return {
    getItem: (key) =>
      serialize(async () => {
        const manifest = parseManifest(await storage.getItem(key));
        if (!manifest) return null;
        let result = "";
        for (let i = 0; i < manifest.count; i++) {
          const chunk = await storage.getItem(chunkKey(key, manifest, i));
          if (chunk === null)
            throw new Error("Não foi possível recuperar a sessão salva.");
          result += chunk;
        }
        return result;
      }),
    setItem: (key, value) =>
      serialize(async () => {
        const characters = Array.from(value);
        const count = Math.max(
          1,
          Math.ceil(characters.length / chunkCharacters),
        );
        if (count > maximumChunks)
          throw new Error("A sessão excede o limite de armazenamento seguro.");
        const previous = parseManifest(await storage.getItem(key));
        const next: Manifest = {
          version: 1,
          generation: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`,
          count,
        };
        try {
          for (let i = 0; i < count; i++)
            await storage.setItem(
              chunkKey(key, next, i),
              characters
                .slice(i * chunkCharacters, (i + 1) * chunkCharacters)
                .join(""),
            );
          // Publish only after every encrypted chunk is persisted.
          await storage.setItem(key, JSON.stringify(next));
        } catch (error) {
          await removeChunks(key, next).catch(() => undefined);
          throw error;
        }
        if (previous) await removeChunks(key, previous).catch(() => undefined);
      }),
    removeItem: (key) =>
      serialize(async () => {
        let manifest: Manifest | null = null;
        try {
          manifest = parseManifest(await storage.getItem(key));
        } catch {
          /* A malformed manifest must still be removable on logout. */
        }
        await storage.removeItem(key);
        if (manifest) await removeChunks(key, manifest);
      }),
  };
}
