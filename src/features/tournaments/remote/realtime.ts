export type SyncStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "updating"
  | "access-ended";
export type TournamentSync = {
  status: SyncStatus;
  sequence: number;
  accessSequence: number;
};
export type TournamentSignal = {
  tournament_id: string;
  sequence: number;
  signal_version: 1;
  category: "competitive" | "access" | "access_revoked";
  revision: number | null;
  recipient_user_id: string | null;
  created_at: string;
};
export type SyncTransport = {
  subscribe(
    id: string,
    receive: (value: unknown) => void,
    status: (
      value: "SUBSCRIBED" | "CLOSED" | "CHANNEL_ERROR" | "TIMED_OUT",
    ) => void,
  ): () => void;
};
type Entry = {
  refs: number;
  generation: number;
  state: TournamentSync;
  snapshotSequence: number;
  connected: boolean;
  dirty: boolean;
  loading: boolean;
  stop?: () => void;
  timer?: ReturnType<typeof setTimeout>;
  retry?: ReturnType<typeof setTimeout>;
  failures: number;
};
const accessDenied = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "status" in error &&
  [401, 403, 404].includes(Number(error.status));

/** Signals are invalidations only. All private state comes from the existing API. */
export class TournamentRealtime {
  private entries = new Map<string, Entry>();
  private active = true;
  private disposed = false;
  constructor(
    private readonly userId: string,
    private transport: SyncTransport | null,
    private readonly read: (id: string) => Promise<{ syncSequence?: number }>,
    private readonly publish: (
      id: string,
      state: TournamentSync | null,
    ) => void,
    private readonly revoke: (id: string) => void,
  ) {}
  configure(transport: SyncTransport | null) {
    if (this.transport === transport) return;
    this.transport = transport;
    this.entries.forEach((entry, id) => {
      this.close(entry);
      if (this.active) void this.start(id, entry);
    });
  }
  retain(id: string) {
    if (this.disposed) return () => {};
    let entry = this.entries.get(id);
    if (!entry) {
      entry = {
        refs: 0,
        generation: 0,
        snapshotSequence: 0,
        connected: false,
        dirty: false,
        loading: false,
        failures: 0,
        state: { status: "connecting", sequence: 0, accessSequence: 0 },
      };
      this.entries.set(id, entry);
      if (this.active) void this.start(id, entry);
      else this.status(id, entry, "offline");
    }
    entry.refs++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--entry.refs > 0) return;
      this.close(entry);
      this.entries.delete(id);
      this.publish(id, null);
    };
  }
  setActive(active: boolean) {
    if (active === this.active || this.disposed) return;
    this.active = active;
    this.entries.forEach((entry, id) => {
      this.close(entry);
      if (active) void this.start(id, entry);
      else if (entry.state.status !== "access-ended")
        this.status(id, entry, "offline");
    });
  }
  /** A token rotation must reconcile even when the SDK keeps its socket open. */
  refresh() {
    if (!this.active || this.disposed) return;
    this.entries.forEach((entry, id) => {
      if (entry.state.status === "access-ended") {
        // A previous 401 may have been temporary. A new identity validation or
        // token still has to pass the API before any private channel is opened.
        this.close(entry);
        void this.start(id, entry);
      } else this.schedule(id, entry);
    });
  }
  accepted(id: string, sequence = 0) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.snapshotSequence = Math.max(entry.snapshotSequence, sequence);
    entry.state = {
      ...entry.state,
      sequence: Math.max(entry.state.sequence, sequence),
      accessSequence: Math.max(entry.state.accessSequence, sequence),
    };
    this.publish(id, entry.state);
    if (entry.state.status === "access-ended" && this.active)
      void this.start(id, entry);
  }
  endAccess(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.close(entry);
    this.status(id, entry, "access-ended");
  }
  dispose() {
    this.disposed = true;
    this.entries.forEach((entry) => this.close(entry));
    this.entries.clear();
  }
  private current(id: string, entry: Entry, generation: number) {
    return (
      !this.disposed &&
      this.active &&
      this.entries.get(id) === entry &&
      entry.generation === generation
    );
  }
  private close(entry: Entry) {
    entry.generation++;
    clearTimeout(entry.timer);
    clearTimeout(entry.retry);
    entry.timer = entry.retry = undefined;
    const stop = entry.stop;
    entry.stop = undefined;
    entry.connected = false;
    entry.loading = false;
    entry.dirty = false;
    stop?.();
  }
  private status(id: string, entry: Entry, status: SyncStatus) {
    entry.state = { ...entry.state, status };
    this.publish(id, entry.state);
  }
  private async start(id: string, entry: Entry) {
    const generation = entry.generation;
    this.status(
      id,
      entry,
      entry.state.sequence ? "reconnecting" : "connecting",
    );
    try {
      await this.read(id);
      if (!this.current(id, entry, generation)) return;
      if (!this.transport) {
        this.status(id, entry, "offline");
        return;
      }
      const stop = this.transport.subscribe(
        id,
        (value) => {
          if (this.current(id, entry, generation))
            this.signal(id, entry, value);
        },
        (status) => {
          if (!this.current(id, entry, generation)) return;
          if (status === "SUBSCRIBED") {
            entry.connected = true;
            entry.failures = 0;
            // Close the read/subscribe gap, including on every SDK rejoin.
            this.schedule(id, entry, 0);
          } else {
            this.close(entry);
            this.retry(id, entry);
          }
        },
      );
      if (this.current(id, entry, generation)) entry.stop = stop;
      else stop();
    } catch (error) {
      if (!this.current(id, entry, generation)) return;
      if (accessDenied(error)) {
        this.revoke(id);
        this.endAccess(id);
      } else this.retry(id, entry);
    }
  }
  private retry(id: string, entry: Entry) {
    if (entry.retry || !this.active || this.disposed) return;
    this.status(id, entry, "reconnecting");
    const generation = entry.generation;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(entry.failures++, 5));
    entry.retry = setTimeout(() => {
      entry.retry = undefined;
      if (this.current(id, entry, generation)) void this.start(id, entry);
    }, delay);
  }
  private signal(id: string, entry: Entry, value: unknown) {
    if (!value || typeof value !== "object") return;
    const signal = value as TournamentSignal;
    if (
      signal.tournament_id !== id ||
      signal.signal_version !== 1 ||
      !Number.isSafeInteger(signal.sequence) ||
      signal.sequence <= 0 ||
      !["competitive", "access", "access_revoked"].includes(signal.category) ||
      !(
        signal.revision === null ||
        (Number.isSafeInteger(signal.revision) && signal.revision >= 0)
      ) ||
      typeof signal.created_at !== "string" ||
      (signal.recipient_user_id !== null &&
        signal.recipient_user_id !== this.userId)
    )
      return;
    if (signal.category === "access_revoked") {
      if (
        signal.recipient_user_id !== this.userId ||
        signal.sequence <= entry.snapshotSequence
      )
        return;
      entry.state = {
        ...entry.state,
        sequence: Math.max(entry.state.sequence, signal.sequence),
      };
      this.revoke(id);
      this.endAccess(id);
      return;
    }
    if (signal.sequence <= entry.state.sequence) return;
    entry.state = {
      ...entry.state,
      status: "updating",
      sequence: signal.sequence,
    };
    this.publish(id, entry.state);
    this.schedule(id, entry);
  }
  private schedule(id: string, entry: Entry, delay = 80) {
    entry.dirty = true;
    if (entry.loading || entry.timer || !this.active) return;
    const generation = entry.generation;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (this.current(id, entry, generation))
        void this.reconcile(id, entry, generation);
    }, delay);
  }
  private async reconcile(id: string, entry: Entry, generation: number) {
    entry.dirty = false;
    entry.loading = true;
    this.status(id, entry, "updating");
    try {
      await this.read(id);
      if (!this.current(id, entry, generation)) return;
      // A manual/initial GET may have been deduplicated with this read while
      // already holding an older snapshot. Do not consume its newer signal.
      if (entry.snapshotSequence < entry.state.sequence) entry.dirty = true;
      this.status(
        id,
        entry,
        entry.dirty
          ? "updating"
          : entry.connected
            ? "connected"
            : "reconnecting",
      );
    } catch (error) {
      if (!this.current(id, entry, generation)) return;
      if (accessDenied(error)) {
        this.revoke(id);
        this.endAccess(id);
      } else {
        this.close(entry);
        this.retry(id, entry);
      }
    } finally {
      if (this.current(id, entry, generation)) {
        entry.loading = false;
        if (entry.dirty) this.schedule(id, entry);
      }
    }
  }
}
