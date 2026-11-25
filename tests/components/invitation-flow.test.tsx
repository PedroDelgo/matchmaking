import React from "react";
import { randomBytes } from "node:crypto";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { InviteScreen } from "../../src/screens/InviteScreen";
import { InviteManager } from "../../src/components/InviteManager";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { useRemoteTournaments } from "../../src/features/tournaments/remote/RemoteProvider";
import { previewInvitation } from "../../src/features/invites/client";
import {
  forgetInvitation,
  invitationToken,
  pendingInvitation,
  rememberInvitation,
} from "../../src/features/invites/credential";
import type { RemoteTournaments } from "../../src/features/tournaments/remote/client";

jest.mock("expo-linking", () => ({ useURL: () => null }));
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../src/components/InviteQr", () => ({ InviteQr: () => null }));
jest.mock("../../src/features/auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../../src/features/tournaments/remote/RemoteProvider", () => ({
  useRemoteTournaments: jest.fn(),
}));
jest.mock("../../src/features/invites/client", () => ({
  ...jest.requireActual("../../src/features/invites/client"),
  previewInvitation: jest.fn(),
}));
type Auth = ReturnType<typeof useAuth>;
let auth: Auth;
const user = "11111111-1111-4111-8111-111111111111",
  tournament = "22222222-2222-4222-8222-222222222222";
let client: {
  userId: string;
  hasPendingAcceptance: jest.Mock;
  acceptInvitation: jest.Mock;
  retryAcceptance: jest.Mock;
};
const preview = {
  name: "Copa de amigos",
  modality: "Futebol",
  format: "single_elimination" as const,
  role: "participant" as const,
  status: "draft" as const,
  availableSlots: 4,
  expiresAt: "2026-11-26T12:00:00.000Z",
  availability: "available" as const,
};
function session(id = user) {
  return {
    user: { id, is_anonymous: false },
    access_token: "current-session",
  } as NonNullable<Auth["session"]>;
}
function publish() {
  jest.mocked(useAuth).mockReturnValue(auth);
  jest.mocked(useRemoteTournaments).mockReturnValue({
    client: auth.session ? (client as unknown as RemoteTournaments) : null,
  } as ReturnType<typeof useRemoteTournaments>);
}
beforeEach(() => {
  forgetInvitation();
  rememberInvitation(invitationToken(randomBytes(32).toString("base64url")));
  auth = {
    configured: true,
    status: "signedOut",
    session: null,
    busy: false,
    signInAsGuest: jest.fn().mockResolvedValue(undefined),
  } as unknown as Auth;
  client = {
    userId: user,
    hasPendingAcceptance: jest.fn().mockResolvedValue(false),
    acceptInvitation: jest.fn().mockResolvedValue({
      tournamentId: tournament,
      role: "participant",
      revision: 2,
      alreadyMember: false,
    }),
    retryAcceptance: jest.fn().mockResolvedValue({
      tournamentId: tournament,
      role: "participant",
      revision: 2,
      alreadyMember: false,
    }),
  };
  jest.mocked(previewInvitation).mockResolvedValue(preview);
  publish();
});
afterEach(() => {
  forgetInvitation();
});

test("consultar convite não admite; convidado cria sessão somente após ação e confirma entrada em outra ação", async () => {
  const ui = await render(<InviteScreen />);
  await waitFor(() => expect(ui.getByText("Copa de amigos")).toBeTruthy());
  expect(auth.signInAsGuest).not.toHaveBeenCalled();
  expect(client.acceptInvitation).not.toHaveBeenCalled();
  await fireEvent.press(
    ui.getByRole("button", { name: "Continuar como convidado" }),
  );
  expect(auth.signInAsGuest).toHaveBeenCalledTimes(1);
  expect(client.acceptInvitation).not.toHaveBeenCalled();
  auth = { ...auth, status: "authenticated", session: session() };
  auth.session!.user.is_anonymous = true;
  publish();
  await ui.rerender(<InviteScreen />);
  await waitFor(() =>
    expect(ui.getByLabelText("Seu apelido na competição")).toBeTruthy(),
  );
  expect(client.acceptInvitation).not.toHaveBeenCalled();
  await fireEvent.changeText(
    ui.getByLabelText("Seu apelido na competição"),
    "Rival novo",
  );
  await fireEvent.press(
    ui.getByRole("button", { name: "Entrar na competição" }),
  );
  expect(client.acceptInvitation).toHaveBeenCalledTimes(1);
  expect(client.acceptInvitation.mock.calls[0][1]).toBe("Rival novo");
  expect(
    ui.getByText("Entrada confirmada. Você está na competição!"),
  ).toBeTruthy();
  expect(pendingInvitation()).toBeNull();
});

test("conta existente é preservada; apelido inválido não envia e espectador não pede apelido", async () => {
  auth = { ...auth, status: "authenticated", session: session() };
  publish();
  const ui = await render(<InviteScreen />);
  await waitFor(() =>
    expect(ui.getByLabelText("Seu apelido na competição")).toBeTruthy(),
  );
  expect(
    ui.queryByRole("button", { name: "Continuar como convidado" }),
  ).toBeNull();
  await fireEvent.press(
    ui.getByRole("button", { name: "Entrar na competição" }),
  );
  expect(client.acceptInvitation).not.toHaveBeenCalled();
  expect(auth.signInAsGuest).not.toHaveBeenCalled();
  await ui.unmount();
  jest
    .mocked(previewInvitation)
    .mockResolvedValue({ ...preview, role: "viewer" });
  const spectator = await render(<InviteScreen />);
  await waitFor(() =>
    expect(
      spectator.getByRole("button", { name: "Acompanhar campeonato" }),
    ).toBeTruthy(),
  );
  expect(spectator.queryByLabelText("Seu apelido na competição")).toBeNull();
});

test("erro de prévia revogada é visível e nenhuma entrada é enviada", async () => {
  jest.mocked(previewInvitation).mockRejectedValue(new Error("INVITE_REVOKED"));
  const ui = await render(<InviteScreen />);
  await waitFor(() =>
    expect(
      ui.getByText(
        "Este convite foi revogado. Quem já entrou mantém seu acesso.",
      ),
    ).toBeTruthy(),
  );
  expect(ui.queryByRole("button", { name: "Entrar na competição" })).toBeNull();
  expect(client.acceptInvitation).not.toHaveBeenCalled();
});

test("sessão existente ainda não validada pede revalidação e não oferece substituí-la por convidado", async () => {
  auth = {
    ...auth,
    status: "error",
    session: session(),
    retrySession: jest.fn().mockResolvedValue(undefined),
  };
  publish();
  const ui = await render(<InviteScreen />);
  await waitFor(() =>
    expect(ui.getByRole("button", { name: "Validar sessão" })).toBeTruthy(),
  );
  expect(
    ui.queryByRole("button", { name: "Continuar como convidado" }),
  ).toBeNull();
  await fireEvent.press(ui.getByRole("button", { name: "Validar sessão" }));
  expect(auth.retrySession).toHaveBeenCalledTimes(1);
  expect(auth.signInAsGuest).not.toHaveBeenCalled();
  expect(client.acceptInvitation).not.toHaveBeenCalled();
});

test("resposta de aceitação da conta anterior não aparece depois de trocar identidade", async () => {
  let resolve!: (value: unknown) => void;
  client.acceptInvitation.mockReturnValue(
    new Promise((value) => {
      resolve = value;
    }),
  );
  auth = { ...auth, status: "authenticated", session: session() };
  publish();
  const ui = await render(<InviteScreen />);
  await waitFor(() =>
    expect(ui.getByLabelText("Seu apelido na competição")).toBeTruthy(),
  );
  await fireEvent.changeText(
    ui.getByLabelText("Seu apelido na competição"),
    "Rival A",
  );
  await fireEvent.press(
    ui.getByRole("button", { name: "Entrar na competição" }),
  );
  auth = { ...auth, session: session("33333333-3333-4333-8333-333333333333") };
  client = { ...client, userId: auth.session!.user.id };
  publish();
  await ui.rerender(<InviteScreen />);
  await act(async () => {
    resolve({
      tournamentId: tournament,
      role: "participant",
      revision: 2,
      alreadyMember: false,
    });
  });
  expect(
    ui.queryByText("Entrada confirmada. Você está na competição!"),
  ).toBeNull();
  await waitFor(() =>
    expect(ui.getByLabelText("Seu apelido na competição")).toBeTruthy(),
  );
  expect(ui.getByLabelText("Seu apelido na competição").props.value).toBe("");
});

test("entrada pendente reaparece sem credencial e usa a repetição; preview de membro não cria nova admissão", async () => {
  forgetInvitation();
  client.hasPendingAcceptance.mockResolvedValue(true);
  auth = { ...auth, status: "authenticated", session: session() };
  publish();
  const ui = await render(<InviteScreen />);
  await waitFor(() =>
    expect(
      ui.getByRole("button", { name: "Repetir entrada pendente" }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    ui.getByRole("button", { name: "Repetir entrada pendente" }),
  );
  expect(client.retryAcceptance).toHaveBeenCalledTimes(1);
  expect(client.acceptInvitation).not.toHaveBeenCalled();
  await ui.unmount();
  rememberInvitation(invitationToken(randomBytes(32).toString("base64url")));
  client.hasPendingAcceptance.mockResolvedValue(false);
  jest.mocked(previewInvitation).mockResolvedValue({
    ...preview,
    membership: { role: "participant", tournamentId: tournament },
  });
  const admitted = await render(<InviteScreen />);
  await waitFor(() =>
    expect(admitted.getByText("Você já participa desta disputa.")).toBeTruthy(),
  );
  expect(
    admitted.queryByRole("button", { name: "Entrar na competição" }),
  ).toBeNull();
});

test("outro token na mesma rota e identidade limpa a prévia e o apelido anteriores sem admitir automaticamente", async () => {
  const first = randomBytes(32).toString("base64url"),
    second = randomBytes(32).toString("base64url");
  auth = { ...auth, status: "authenticated", session: session() };
  publish();
  jest.mocked(previewInvitation).mockImplementation(async (credential) => ({
    ...preview,
    name: credential.value === first ? "Copa anterior" : "Outra copa",
  }));
  const ui = await render(<InviteScreen pathToken={first} />);
  await waitFor(() => expect(ui.getByText("Copa anterior")).toBeTruthy());
  await fireEvent.changeText(
    ui.getByLabelText("Seu apelido na competição"),
    "Nome anterior",
  );
  await ui.rerender(<InviteScreen pathToken={second} />);
  await waitFor(() => expect(ui.getByText("Outra copa")).toBeTruthy());
  expect(ui.queryByText("Copa anterior")).toBeNull();
  expect(ui.getByLabelText("Seu apelido na competição").props.value).toBe("");
  expect(client.acceptInvitation).not.toHaveBeenCalled();
});

function management() {
  let summary = {
    id: "44444444-4444-4444-8444-444444444444",
    role: "participant" as const,
    createdAt: "2026-11-25T12:00:00.000Z",
    expiresAt: "2026-11-26T12:00:00.000Z",
    maxUses: 16,
    uses: 0,
    status: "active" as "active" | "revoked",
  };
  let pending = false,
    brokenList = false;
  const managerClient = {
    userId: user,
    detail: jest.fn().mockResolvedValue({}),
    invitationList: jest.fn(async (_id: string, kind: string) => {
      if (brokenList) throw new Error("Sem conexão para atualizar.");
      return { items: kind === "invites" ? [summary] : [] };
    }),
    hasPendingInvitationManagement: jest.fn(async () => pending),
    manageInvitation: jest.fn(async (_id: string, type: string) => {
      if (type === "revoke_invite") {
        pending = true;
        throw new Error("Confirmação pendente.");
      }
      return {
        invite: summary,
        shareUrl: `http://127.0.0.1:8081/invite#token=${randomBytes(32).toString("base64url")}`,
        code: "ABCD2345",
        development: true,
      };
    }),
    retryInvitationManagement: jest.fn(async () => {
      summary = { ...summary, status: "revoked" };
      pending = false;
      brokenList = true;
      return { invite: summary, replayed: true };
    }),
  };
  auth = { ...auth, status: "authenticated", session: session() };
  publish();
  jest.mocked(useRemoteTournaments).mockReturnValue({
    client: managerClient as unknown as RemoteTournaments,
  } as ReturnType<typeof useRemoteTournaments>);
  return {
    revoke: () => {
      summary = { ...summary, status: "revoked" };
    },
  };
}

test("atualização manual retira link e QR de um convite revogado em outra sessão", async () => {
  const manager = management();
  const ui = await render(
    <InviteManager tournamentId={tournament} canManage />,
  );
  await waitFor(() => expect(ui.getByText("Ativo")).toBeTruthy());
  await fireEvent.press(ui.getByRole("button", { name: "Criar convite" }));
  expect(ui.getByRole("button", { name: "Copiar link" })).toBeTruthy();
  manager.revoke();
  await fireEvent.press(ui.getByRole("button", { name: "Atualizar acessos" }));
  await waitFor(() =>
    expect(ui.queryByRole("button", { name: "Copiar link" })).toBeNull(),
  );
  expect(ui.getByText("Revogado")).toBeTruthy();
});

test("repetição de revogação confirmada retira credenciais mesmo se a releitura posterior falhar", async () => {
  management();
  const ui = await render(
    <InviteManager tournamentId={tournament} canManage />,
  );
  await waitFor(() => expect(ui.getByText("Ativo")).toBeTruthy());
  await fireEvent.press(ui.getByRole("button", { name: "Criar convite" }));
  await fireEvent.press(ui.getByRole("button", { name: "Revogar convite" }));
  const buttons = ui.getAllByRole("button", { name: "Revogar convite" });
  await fireEvent.press(buttons.at(-1)!);
  await waitFor(() =>
    expect(
      ui.getByRole("button", { name: "Repetir gestão pendente" }),
    ).toBeTruthy(),
  );
  expect(ui.getByRole("button", { name: "Copiar link" })).toBeTruthy();
  await fireEvent.press(
    ui.getByRole("button", { name: "Repetir gestão pendente" }),
  );
  await waitFor(() =>
    expect(ui.queryByRole("button", { name: "Copiar link" })).toBeNull(),
  );
});
