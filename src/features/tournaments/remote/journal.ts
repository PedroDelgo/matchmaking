import { randomUUID } from "expo-crypto";
import { localStorageAdapter } from "../../../store/storage";

type Entry = {
  id: string;
  intent: string;
  payload: unknown;
  state: "pending" | "confirmed" | "rejected";
  remoteId?: string;
};
type Disk = {
  version: 1;
  installationId: string;
  entries: Record<string, Entry>;
};
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = () =>
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("matchmaking-remote-journal", work)
      : work();
  const result = tail.then(run, run);
  tail = result.catch(() => {});
  return result;
}
export function createJournal(
  scope: string,
  storage = localStorageAdapter,
  generate = randomUUID,
) {
  const key = `matchmaking-remote-journal-v1:${encodeURIComponent(scope)}`;
  async function read(): Promise<Disk> {
    const raw = await storage.getItem(key);
    if (raw === null)
      return { version: 1, installationId: generate(), entries: {} };
    const d = JSON.parse(raw) as Disk;
    if (
      d.version !== 1 ||
      !uuid.test(d.installationId) ||
      !d.entries ||
      typeof d.entries !== "object" ||
      Array.isArray(d.entries) ||
      Object.values(d.entries).some(
        (e) =>
          !e ||
          !uuid.test(e.id) ||
          typeof e.intent !== "string" ||
          !["pending", "confirmed", "rejected"].includes(e.state) ||
          !Object.hasOwn(e, "payload"),
      )
    )
      throw new Error("JOURNAL_UNAVAILABLE");
    return d;
  }
  async function write(d: Disk) {
    const raw = JSON.stringify(d);
    await storage.setItem(key, raw);
    if ((await storage.getItem(key)) !== raw)
      throw new Error("JOURNAL_UNAVAILABLE");
  }
  return {
    peek: (name: string) =>
      serial(async () => {
        const d = await read();
        const e = d.entries[name];
        return e ? (JSON.parse(JSON.stringify(e)) as Entry) : undefined;
      }),
    installationId: () =>
      serial(async () => {
        const d = await read();
        await write(d);
        return d.installationId;
      }),
    prepare: (
      name: string,
      intent: string,
      payload: unknown,
      options: { keepConfirmed?: boolean; newCopy?: boolean } = {},
    ) =>
      serial(async () => {
        const d = await read(),
          old = d.entries[name];
        if (
          old &&
          !options.newCopy &&
          (old.state === "pending" ||
            (options.keepConfirmed && old.state === "confirmed"))
        ) {
          if (old.intent !== intent)
            throw new Error(
              options.keepConfirmed ? "NEW_COPY_REQUIRED" : "PENDING_OPERATION",
            );
          return JSON.parse(JSON.stringify(old)) as Entry;
        }
        const entry: Entry = {
          id: generate(),
          intent,
          payload: JSON.parse(JSON.stringify(payload)),
          state: "pending",
        };
        d.entries[name] = entry;
        await write(d);
        return entry;
      }),
    finish: (name: string, id: string, remoteId: string) =>
      serial(async () => {
        const d = await read(),
          e = d.entries[name];
        if (!e || e.id !== id) throw new Error("JOURNAL_UNAVAILABLE");
        e.state = "confirmed";
        e.remoteId = remoteId;
        await write(d);
      }),
    reject: (name: string, id: string) =>
      serial(async () => {
        const d = await read(),
          e = d.entries[name];
        if (!e || e.id !== id) throw new Error("JOURNAL_UNAVAILABLE");
        e.state = "rejected";
        delete e.remoteId;
        await write(d);
      }),
    forget: (name: string, id: string) =>
      serial(async () => {
        const d = await read();
        if (d.entries[name]?.id !== id) throw new Error("JOURNAL_UNAVAILABLE");
        delete d.entries[name];
        await write(d);
      }),
  };
}
