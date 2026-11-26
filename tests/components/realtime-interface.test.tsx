import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import { MatchScreen } from "../../src/screens/MatchScreen";
import { ChampionScreen } from "../../src/screens/ChampionScreen";
import { InviteManager } from "../../src/components/InviteManager";
import { useTournament } from "../../src/features/tournaments/useTournament";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useRemoteTournaments } from "../../src/features/tournaments/remote/RemoteProvider";
import { useMotionPreference } from "../../src/hooks/useReducedMotion";
import { recordResult } from "../../src/features/tournaments/engine/tournament";
import type { RemoteTournaments } from "../../src/features/tournaments/remote/client";
import { tournamentFixture } from "../fixtures/tournaments";

jest.mock("../../src/features/tournaments/useTournament", () => ({
  useTournament: jest.fn(),
}));
jest.mock("../../src/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../../src/features/tournaments/remote/RemoteProvider", () => ({
  useRemoteTournaments: jest.fn(),
}));
jest.mock("../../src/hooks/useReducedMotion", () => {
  const useMotionPreference = jest.fn(() => ({ ready: true, reduced: true }));
  return {
    useMotionPreference,
    useReducedMotion: () => useMotionPreference().reduced,
  };
});
jest.mock("../../src/components/InviteQr", () => ({ InviteQr: () => null }));
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../src/utils/share", () => ({ shareText: jest.fn() }));

const cup = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const identity = {
  userId: user,
  apiUrl: "http://127.0.0.1:8090",
} as RemoteTournaments;
type Source = ReturnType<typeof useTournament>;
function auth(status: "authenticated" | "refreshing" = "authenticated") {
  jest.mocked(useAuth).mockReturnValue({
    status,
    session: status === "refreshing" ? null : { user: { id: user } },
  } as ReturnType<typeof useAuth>);
}
function source(
  tournament = tournamentFixture("active", cup),
  revision = 10,
): Source {
  return {
    tournament,
    id: cup,
    cloud: true,
    client: identity,
    revision,
    canManage: true,
    access: { role: "organizer" },
    busy: false,
    pending: false,
    status: "success",
    error: undefined,
    sync: { status: "connected", sequence: revision, accessSequence: revision },
    href: (tab) => `/tournament/${cup}/${tab}?source=cloud`,
    reload: jest.fn().mockResolvedValue(undefined),
    add: jest.fn(),
    remove: jest.fn(),
    start: jest.fn(),
    score: jest.fn().mockResolvedValue(tournament),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  auth();
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: true, reduced: true });
});
afterEach(() => jest.useRealTimers());

test.each([false, true])(
  "edição iniciada com partida concluída=%s não envia revisão antiga e exige revisão explícita",
  async (completed) => {
    let t = tournamentFixture("active", cup);
    const match = t.matches[0];
    if (completed) t = recordResult(t, match.id, 3, 1);
    let current = source(t);
    const score = jest.fn().mockResolvedValue(t);
    current.score = score;
    jest.mocked(useTournament).mockImplementation(() => current);
    jest
      .mocked(useLocalSearchParams)
      .mockReturnValue({ id: match.id, tournamentId: cup, source: "cloud" });
    const ui = await render(<MatchScreen />);
    if (completed)
      await fireEvent.press(
        ui.getByRole("button", { name: "Corrigir resultado" }),
      );
    const firstName = t.participants.find(
      (p) => p.id === match.participant1Id,
    )!.displayName;
    const secondName = t.participants.find(
      (p) => p.id === match.participant2Id,
    )!.displayName;
    await fireEvent.changeText(
      ui.getByLabelText(`Placar de ${firstName}`),
      "7",
    );
    await fireEvent.changeText(
      ui.getByLabelText(`Placar de ${secondName}`),
      "2",
    );
    await fireEvent.press(
      ui.getByRole("button", { name: "Confirmar resultado" }),
    );
    expect(ui.getByRole("button", { name: "Salvar resultado" })).toBeTruthy();
    // Another confirmed result arrives while the confirmation dialog is open.
    const updated = recordResult(t, t.matches[1].id, 5, 1);
    current = { ...current, tournament: updated, revision: 11 };
    await ui.rerender(<MatchScreen />);
    expect(
      ui.getByRole("button", { name: "Confirmar resultado" }),
    ).toBeDisabled();
    await fireEvent.press(ui.getByRole("button", { name: "Salvar resultado" }));
    expect(score).not.toHaveBeenCalled();
    expect(ui.getByLabelText(`Placar de ${firstName}`)).toHaveProp(
      "value",
      "7",
    );
    await fireEvent.press(
      ui.getByRole("button", { name: "Revisar resultado atualizado" }),
    );
    expect(ui.getByLabelText(`Placar de ${firstName}`)).toHaveProp(
      "value",
      completed ? "3" : "0",
    );
    expect(ui.getByLabelText(`Placar de ${secondName}`)).toHaveProp(
      "value",
      completed ? "1" : "0",
    );
    await fireEvent.changeText(
      ui.getByLabelText(`Placar de ${firstName}`),
      "4",
    );
    await fireEvent.changeText(
      ui.getByLabelText(`Placar de ${secondName}`),
      "1",
    );
    await fireEvent.press(
      ui.getByRole("button", { name: "Confirmar resultado" }),
    );
    await fireEvent.press(ui.getByRole("button", { name: "Salvar resultado" }));
    expect(score).toHaveBeenCalledTimes(1);
    expect(score).toHaveBeenCalledWith(match.id, 4, 1, undefined, 11);
    await ui.unmount();
  },
);

test("revalidação Auth da mesma conta não repete confetes; correção real da final apresenta novo campeão", async () => {
  jest.useFakeTimers();
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: true, reduced: false });
  const t = tournamentFixture("completed", cup);
  let current = source(t, 20);
  jest.mocked(useTournament).mockImplementation(() => current);
  const ui = await render(<ChampionScreen />);
  expect(
    ui.getByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeTruthy();
  await act(() => jest.advanceTimersByTime(5000));
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  auth("refreshing");
  current = {
    ...current,
    client: null,
    tournament: undefined,
    status: "unauthorized",
    sync: undefined,
  };
  await ui.rerender(<ChampionScreen />);
  expect(ui.queryByTestId("champion-reveal")).toBeNull();
  auth();
  current = source(t, 20);
  await ui.rerender(<ChampionScreen />);
  expect(ui.getByText("Campeão!")).toBeTruthy();
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  current = { ...current, tournament: JSON.parse(JSON.stringify(t)) };
  await ui.rerender(<ChampionScreen />);
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  const final = t.matches.find((m) => m.nextMatchId === null)!;
  const corrected = recordResult(t, final.id, 1, 5);
  expect(corrected.championId).not.toBe(t.championId);
  current = source(corrected, 21);
  await ui.rerender(<ChampionScreen />);
  expect(
    ui.getByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeTruthy();
  await act(() => jest.advanceTimersByTime(1200));
  const winner = corrected.participants.find(
    (p) => p.id === corrected.championId,
  )!;
  expect(ui.getAllByText(winner.displayName).length).toBeGreaterThan(0);
  expect(ui.getByTestId("champion-final-result")).toBeTruthy();
  await ui.unmount();
});

test("gestão agrupa sinais e atualiza membros após reconciliação, sem loop de detalhes", async () => {
  let members: {
    userId: string;
    role: "viewer";
    displayName: string;
    createdAt: string;
  }[] = [];
  const client = {
    ...identity,
    detail: jest.fn().mockResolvedValue({}),
    invitationList: jest.fn(async (_id: string, kind: string) => ({
      items: kind === "members" ? members : [],
    })),
    hasPendingInvitationManagement: jest.fn().mockResolvedValue(false),
  };
  let remote: ReturnType<typeof useRemoteTournaments> = {
    items: [],
    nextCursor: null,
    status: "success",
    details: {},
    busy: false,
    pending: {},
    client: client as unknown as RemoteTournaments,
    syncById: {
      [cup]: { status: "connected" as const, sequence: 0, accessSequence: 0 },
    },
  };
  jest.mocked(useRemoteTournaments).mockImplementation(() => remote);
  const ui = await render(<InviteManager tournamentId={cup} canManage />);
  await waitFor(() => expect(client.invitationList).toHaveBeenCalledTimes(2));
  expect(client.detail).toHaveBeenCalledTimes(1);
  for (let sequence = 1; sequence <= 10; sequence++) {
    remote = {
      ...remote,
      syncById: { [cup]: { status: "updating", sequence, accessSequence: 0 } },
    };
    await ui.rerender(<InviteManager tournamentId={cup} canManage />);
  }
  expect(client.invitationList).toHaveBeenCalledTimes(2);
  members = [
    {
      userId: "new-member",
      role: "viewer",
      displayName: "Amigo aceito",
      createdAt: "2026-11-26T12:00:00Z",
    },
  ];
  remote = {
    ...remote,
    syncById: {
      [cup]: { status: "connected", sequence: 10, accessSequence: 10 },
    },
  };
  await ui.rerender(<InviteManager tournamentId={cup} canManage />);
  await waitFor(() => expect(ui.getByText("Amigo aceito")).toBeTruthy());
  expect(client.invitationList).toHaveBeenCalledTimes(4);
  expect(client.detail).toHaveBeenCalledTimes(1);
  await ui.rerender(<InviteManager tournamentId={cup} canManage />);
  expect(client.invitationList).toHaveBeenCalledTimes(4);
  await ui.unmount();
});
