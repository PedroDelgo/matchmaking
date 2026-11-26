import React, { useSyncExternalStore } from "react";
import { act, render, waitFor, within } from "@testing-library/react-native";
import { HomeScreen } from "../../src/screens/HomeScreen";
import { TournamentsScreen } from "../../src/screens/TournamentsScreen";
import { useRemoteTournaments } from "../../src/features/tournaments/remote/RemoteProvider";
import { RemoteTournaments } from "../../src/features/tournaments/remote/client";
import { useAppStore, emptyDraft } from "../../src/store/useAppStore";
import { tournamentFixture } from "../fixtures/tournaments";

const mockFocus = {
  focused: false,
  callbacks: new Set<() => void | (() => void)>(),
};
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  usePathname: () => "/",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => {
      mockFocus.callbacks.add(callback);
      if (mockFocus.focused) callback();
      return () => mockFocus.callbacks.delete(callback);
    }, [callback]);
  },
}));
jest.mock("../../src/features/tournaments/remote/RemoteProvider", () => ({
  useRemoteTournaments: jest.fn(),
}));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
const id = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222";
const empty = {
  items: [],
  nextCursor: null,
  status: "success" as const,
  details: {},
  busy: false,
  pending: {},
  syncById: {},
};
const noop = () => () => {};
function Harness({
  client,
  Screen,
}: {
  client: RemoteTournaments | null;
  Screen: React.ComponentType;
}) {
  const state = useSyncExternalStore(
    client?.subscribe ?? noop,
    client?.getSnapshot ?? (() => empty),
    () => empty,
  );
  jest.mocked(useRemoteTournaments).mockReturnValue({ client, ...state });
  return <Screen />;
}
async function focus() {
  await act(async () => {
    mockFocus.focused = true;
    mockFocus.callbacks.forEach((callback) => callback());
  });
}
beforeEach(() => {
  mockFocus.focused = false;
  mockFocus.callbacks.clear();
  useAppStore.setState({
    tournaments: [],
    profile: { id: "me", nickname: "Pedro" },
    draft: { ...emptyDraft },
    hydrated: true,
    storageError: null,
  });
});
const screens = [
  ["Home", HomeScreen],
  ["Torneios", TournamentsScreen],
] as const;

test.each(screens)(
  "%s atualiza o resumo ao retornar do detalhe confirmado, sem assinatura própria",
  async (_name, Screen) => {
    let completed = false;
    const request = jest.fn(async (url: unknown) => ({
      ok: true,
      json: async () =>
        String(url).includes("?")
          ? {
              items: [
                {
                  tournamentId: id,
                  name: "Copa remota",
                  modality: "Futebol",
                  capacity: 4,
                  status: completed ? "completed" : "draft",
                  revision: completed ? 4 : 1,
                  participantCount: 4,
                  completedMatches: completed ? 3 : 0,
                  totalMatches: 3,
                  champion: completed ? "Ana" : undefined,
                  createdAt: "2026-11-26T10:00:00Z",
                  updatedAt: completed
                    ? "2026-11-26T11:00:00Z"
                    : "2026-11-26T10:00:00Z",
                },
              ],
              nextCursor: null,
            }
          : {
              tournamentId: id,
              revision: 4,
              syncSequence: 9,
              tournament: tournamentFixture("completed"),
            },
    } as Response));
    const client = new RemoteTournaments(
      "http://127.0.0.1:8090",
      user,
      () => "token",
      request,
    );
    const retain = jest.spyOn(client, "retainTournament");
    await client.list();
    const ui = await render(<Harness client={client} Screen={Screen} />);
    const card = () => within(ui.getByRole("button", { name: "Abrir Copa remota" }));
    expect(card().getByText("Em preparação")).toBeTruthy();
    completed = true;
    await act(async () => {
      await client.detail(id, true);
    });
    expect(client.getSnapshot().details[id].data?.revision).toBe(4);
    expect(card().getByText("Em preparação")).toBeTruthy();
    await focus();
    await waitFor(() => expect(card().getByText("Concluído")).toBeTruthy());
    expect(ui.getByText("Campeão: Ana")).toBeTruthy();
    expect(client.getSnapshot().items[0].updatedAt).toBe("2026-11-26T11:00:00Z");
    expect(request).toHaveBeenCalledTimes(3); // initial list, detail and focused list.
    await ui.rerender(<Harness client={client} Screen={Screen} />);
    expect(request).toHaveBeenCalledTimes(3);
    expect(retain).not.toHaveBeenCalled();
    await ui.unmount();
    client.dispose();
  },
);

test.each(screens)(
  "%s sem conta mantém torneio local e não faz requisição ao receber foco",
  async (_name, Screen) => {
    const savedFetch = globalThis.fetch,
      request = jest.fn();
    globalThis.fetch = request;
    useAppStore.setState({ tournaments: [tournamentFixture("completed")] });
    try {
      const ui = await render(<Harness client={null} Screen={Screen} />);
      await focus();
      expect(ui.getByText("Campeão: Ana")).toBeTruthy();
      expect(request).not.toHaveBeenCalled();
      await ui.unmount();
    } finally {
      globalThis.fetch = savedFetch;
    }
  },
);
