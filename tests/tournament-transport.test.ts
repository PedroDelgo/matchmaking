import type { SupabaseClient } from "@supabase/supabase-js";
import { tournamentTransport } from "../src/features/tournaments/remote/transport";

const cup = "11111111-1111-4111-8111-111111111111";
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function sdk() {
  type Channel = {
    topic: string;
    on: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
    teardown: jest.Mock;
    emit: (value: unknown) => void;
    ack: () => void;
  };
  const current = new Map<string, Channel>();
  const made: Channel[] = [];
  const pendingRemovals: (() => void)[] = [];
  let delayed = false,
    failure = false;
  function createChannel(topic: string) {
    let joined = false,
      receive: ((payload: { new: unknown }) => void) | undefined,
      status: ((value: "SUBSCRIBED" | "CLOSED") => void) | undefined;
    const channel: Channel = {
      topic: `realtime:${topic}`,
      on: jest.fn((_type, _filter, callback) => {
        if (joined) throw new Error("cannot add callbacks after subscribe");
        receive = callback;
        return channel;
      }),
      subscribe: jest.fn((callback) => {
        if (failure) throw new Error("Subscription failed");
        if (joined) throw new Error("tried to join multiple times");
        joined = true;
        status = callback;
        return channel;
      }),
      unsubscribe: jest.fn(async () => {
        current.delete(topic);
        return "ok";
      }),
      teardown: jest.fn(),
      emit: (value: unknown) => receive?.({ new: value }),
      ack: () => status?.("SUBSCRIBED"),
    };
    return channel;
  }
  const client = {
    channel: jest.fn((topic: string) => {
      const old = current.get(topic);
      if (old) return old;
      const channel = createChannel(topic);
      current.set(topic, channel);
      made.push(channel);
      return channel;
    }),
    getChannels: jest.fn(() => [...current.values()]),
    removeChannel: jest.fn(async (channel: Channel) => {
      if (delayed)
        await new Promise<void>((resolve) => pendingRemovals.push(resolve));
      current.delete(channel.topic.slice("realtime:".length));
      channel.teardown();
      return "ok";
    }),
  };
  return {
    client: client as unknown as SupabaseClient,
    mock: client,
    made,
    delayRemoval: () => {
      delayed = true;
    },
    finishRemoval: () => {
      delayed = false;
      pendingRemovals.splice(0).forEach((resolve) => resolve());
    },
    failSubscribe: (next: boolean) => {
      failure = next;
    },
  };
}

test("a nova identidade espera o canal anterior sair antes de reutilizar o tópico", async () => {
  const h = sdk(),
    a = tournamentTransport(h.client),
    b = tournamentTransport(h.client),
    receiveA = jest.fn(),
    receiveB = jest.fn(),
    statusA = jest.fn(),
    statusB = jest.fn(),
    stopA = a.subscribe(cup, receiveA, statusA);
  await flush();
  h.made[0].ack();
  h.delayRemoval();
  stopA();
  let stopB!: () => void;
  expect(() => {
    stopB = b.subscribe(cup, receiveB, statusB);
  }).not.toThrow();
  await flush();
  expect(h.mock.channel).toHaveBeenCalledTimes(1);
  h.made[0].emit({ previousIdentity: true });
  expect(receiveA).not.toHaveBeenCalled();
  expect(receiveB).not.toHaveBeenCalled();
  h.finishRemoval();
  await flush();
  expect(h.mock.channel).toHaveBeenCalledTimes(2);
  expect(h.made).toHaveLength(2);
  h.made[1].ack();
  h.made[1].emit({ currentIdentity: true });
  expect(statusB).toHaveBeenCalledWith("SUBSCRIBED");
  expect(receiveB).toHaveBeenCalledWith({ currentIdentity: true });
  stopB();
  await flush();
  expect(h.mock.getChannels()).toHaveLength(0);
});

test("cancelar enquanto aguarda teardown não cria canal nem deixa listener órfão", async () => {
  const h = sdk(),
    transport = tournamentTransport(h.client),
    stopA = transport.subscribe(cup, jest.fn(), jest.fn());
  await flush();
  h.delayRemoval();
  stopA();
  const statusB = jest.fn();
  let stopB!: () => void;
  expect(() => {
    stopB = transport.subscribe(cup, jest.fn(), statusB);
  }).not.toThrow();
  stopB();
  stopB();
  h.finishRemoval();
  await flush();
  expect(h.mock.channel).toHaveBeenCalledTimes(1);
  expect(h.mock.removeChannel).toHaveBeenCalledTimes(1);
  expect(statusB).not.toHaveBeenCalled();
  expect(h.mock.getChannels()).toHaveLength(0);
});

test("erro síncrono do SDK é informado e limpa o canal antes da nova tentativa", async () => {
  const h = sdk(),
    transport = tournamentTransport(h.client),
    status = jest.fn();
  h.failSubscribe(true);
  expect(() => transport.subscribe(cup, jest.fn(), status)).not.toThrow();
  await flush();
  expect(status).toHaveBeenCalledWith("CHANNEL_ERROR");
  expect(h.mock.getChannels()).toHaveLength(0);
  h.failSubscribe(false);
  const stop = transport.subscribe(cup, jest.fn(), status);
  await flush();
  h.made[1].ack();
  expect(status).toHaveBeenCalledWith("SUBSCRIBED");
  stop();
  await flush();
});

test("falha no leave força fechamento limitado antes de criar a assinatura seguinte", async () => {
  const h = sdk(),
    transport = tournamentTransport(h.client),
    stopA = transport.subscribe(cup, jest.fn(), jest.fn());
  await flush();
  h.mock.removeChannel.mockRejectedValueOnce(new Error("Network unavailable"));
  stopA();
  const statusB = jest.fn(),
    stopB = tournamentTransport(h.client).subscribe(cup, jest.fn(), statusB);
  await flush();
  expect(h.made[0].unsubscribe).toHaveBeenCalledWith(0);
  expect(h.made[0].teardown).toHaveBeenCalledTimes(1);
  expect(h.made).toHaveLength(2);
  h.made[1].ack();
  expect(statusB).toHaveBeenCalledWith("SUBSCRIBED");
  stopB();
  await flush();
});
