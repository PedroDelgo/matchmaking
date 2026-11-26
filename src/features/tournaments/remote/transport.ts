import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { SyncTransport } from "./realtime";

// The SDK reuses channel objects by topic, including objects still leaving. Keep
// the handoff shared across transport instances so account A cannot race B.
const leases = new WeakMap<SupabaseClient, Map<string, Promise<void>>>();
async function remove(client: SupabaseClient, channel: RealtimeChannel) {
  try {
    await client.removeChannel(channel);
  } catch {
    // A failed leave still needs the SDK's close hook to remove its cached topic.
  }
  if (client.getChannels().includes(channel)) {
    await channel.unsubscribe(0);
    if (client.getChannels().includes(channel))
      throw new Error("Channel removal pending");
    channel.teardown();
  }
}

/** One shared Auth SDK/socket; one private logical subscription per active cup. */
export function tournamentTransport(client: SupabaseClient): SyncTransport {
  return {
    subscribe(id, receive, status) {
      let active = true;
      const topic = `tournament:${id}`;
      let topics = leases.get(client);
      if (!topics) {
        topics = new Map();
        leases.set(client, topics);
      }
      const previous = topics.get(topic) ?? Promise.resolve();
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = previous.then(() => released);
      topics.set(topic, tail);
      void tail.then(() => {
        if (topics.get(topic) === tail) topics.delete(topic);
      });
      let channel: RealtimeChannel | undefined,
        cleanup: Promise<void> | undefined,
        initializing: Promise<void>;
      const close = () => {
        if (!cleanup)
          cleanup = initializing
            .then(() => (channel ? remove(client, channel) : undefined))
            .catch(() => undefined)
            .finally(release);
        return cleanup;
      };
      initializing = previous.then(async () => {
        if (!active) return;
        try {
          // A previous SDK leave may have failed; do not reuse that stale object.
          const stale = client
            .getChannels()
            .find((candidate) => candidate.topic === `realtime:${topic}`);
          if (stale) await remove(client, stale);
          if (!active) return;
          channel = client.channel(topic, {
            config: { private: true, postgres_changes_options: { wait: true } },
          });
          channel
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "tournament_signals",
                filter: `tournament_id=eq.${id}`,
              },
              (payload) => {
                if (active) receive(payload.new);
              },
            )
            .subscribe((value) => {
              if (active) status(value);
            });
        } catch {
          if (active) status("CHANNEL_ERROR");
          active = false;
        }
      });
      void initializing.finally(() => {
        if (!active) void close();
      });
      return () => {
        active = false;
        void close();
      };
    },
  };
}
