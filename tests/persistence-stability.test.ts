import AsyncStorage from "@react-native-async-storage/async-storage";
import { waitFor } from "@testing-library/react-native";
import { localStorageAdapter } from "../src/store/storage";
import { emptyDraft, validatePersisted } from "../src/store/useAppStore";
import {
  getRanking,
  getTournamentStats,
} from "../src/features/tournaments/engine/tournament";

const key = "matchmaking-local-v1";
const savedState = () => ({
  tournaments: [],
  profile: { id: "local-test", nickname: "Pedro" },
  draft: { ...emptyDraft },
});

// A new module represents reopening the app, including its session write guard.
// Keep the real adapter connected to the shared native AsyncStorage mock.
function reopenApp() {
  let store!: typeof import("../src/store/useAppStore").useAppStore;
  jest.isolateModules(() => {
    jest.doMock("../src/store/storage", () => ({ localStorageAdapter }));
    store = require("../src/store/useAppStore").useAppStore;
  });
  jest.dontMock("../src/store/storage");
  return store;
}

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

test.each([
  ["objeto sem estado", "{}"],
  ["null", "null"],
  ["booleano", "false"],
  ["array", "[]"],
  ["versão sem estado", '{"version":1}'],
  ["versão ausente", JSON.stringify({ state: savedState() })],
  ["versão textual", JSON.stringify({ state: savedState(), version: "1" })],
  ["versão incompatível", JSON.stringify({ state: savedState(), version: 2 })],
])("preserva envelope inválido: %s", async (_name, raw) => {
  await AsyncStorage.setItem(key, raw);
  const store = reopenApp();
  await store.persist.rehydrate();
  expect(store.getState().hydrated).toBe(true);
  expect(store.getState().storageError).toMatch(/preservado/);
  store.getState().updateDraft({ name: "Apenas na memória" });
  expect(store.getState().draft.name).toBe("Apenas na memória");
  expect(await AsyncStorage.getItem(key)).toBe(raw);
});

test("ignora campos extras persistidos sem substituir ações do store", async () => {
  await AsyncStorage.setItem(
    key,
    JSON.stringify({
      state: {
        ...savedState(),
        create: null,
        score: "conteúdo inválido para uma ação",
        storageError: "erro injetado pelo arquivo",
      },
      version: 1,
    }),
  );
  const store = reopenApp();
  await store.persist.rehydrate();
  expect(typeof store.getState().create).toBe("function");
  expect(typeof store.getState().score).toBe("function");
  expect(store.getState().storageError).toBeNull();
  store.getState().updateDraft({ name: "Copa recuperada", capacity: 4 });
  const id = store.getState().create();
  expect(store.getState().tournaments[0].id).toBe(id);
});

test("falha de leitura do AsyncStorage preserva o arquivo e bloqueia gravações", async () => {
  const raw = JSON.stringify({ state: savedState(), version: 1 });
  await AsyncStorage.setItem(key, raw);
  jest
    .mocked(AsyncStorage.getItem)
    .mockRejectedValueOnce(new Error("read failed"));
  const store = reopenApp();
  await store.persist.rehydrate();
  expect(store.getState().hydrated).toBe(true);
  expect(store.getState().storageError).toMatch(/ler os dados salvos/);
  store.getState().updateProfile("Nome temporário");
  expect(store.getState().profile.nickname).toBe("Nome temporário");
  expect(await AsyncStorage.getItem(key)).toBe(raw);
});

test("falha de escrita mantém a memória, bloqueia novas escritas e permite recuperar ao reabrir", async () => {
  const store = reopenApp();
  await store.persist.rehydrate();
  const raw = await AsyncStorage.getItem(key);
  const writesBeforeFailure = jest.mocked(AsyncStorage.setItem).mock.calls
    .length;
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error("disk full"));
  store.getState().updateDraft({ name: "Rascunho não salvo" });
  await waitFor(() => expect(store.getState().storageError).toMatch(/salvar/));
  store.getState().updateProfile("Também na memória");
  expect(store.getState().draft.name).toBe("Rascunho não salvo");
  expect(store.getState().profile.nickname).toBe("Também na memória");
  expect(jest.mocked(AsyncStorage.setItem).mock.calls.length).toBe(
    writesBeforeFailure + 1,
  );
  expect(await AsyncStorage.getItem(key)).toBe(raw);

  const reopened = reopenApp();
  await reopened.persist.rehydrate();
  expect(reopened.getState().storageError).toBeNull();
  expect(reopened.getState().draft.name).toBe("");
  reopened.getState().updateDraft({ name: "Voltou a salvar" });
  const recovered = reopenApp();
  await recovered.persist.rehydrate();
  expect(recovered.getState().draft.name).toBe("Voltou a salvar");
});

test.each([4, 8, 16] as const)(
  "conclui, recarrega e corrige %i jogadores sem alterar outro torneio",
  async (capacity) => {
    const store = reopenApp();
    await store.persist.rehydrate();
    store.getState().updateProfile("Pedro");
    const profile = store.getState().profile;
    store.getState().updateDraft({ name: "Outra copa", capacity: 4 });
    const otherId = store.getState().create();
    store.getState().add(otherId, "Pedro", profile.id);
    store.getState().add(otherId, "Rival");
    const other = store.getState().tournaments.find((t) => t.id === otherId)!;

    store.getState().updateDraft({ name: `Copa ${capacity}`, capacity });
    const id = store.getState().create();
    store.getState().add(id, "Pedro", profile.id);
    store.getState().fillExamples(id);
    store.getState().start(id);
    const matches = store
      .getState()
      .tournaments.find((t) => t.id === id)!.matches;
    for (const match of matches) store.getState().score(id, match.id, 3, 1);
    store.getState().updateDraft({ name: "Próximo campeonato", step: 1 });
    const completed = store.getState().tournaments.find((t) => t.id === id)!;
    expect(completed.status).toBe("completed");
    expect(getTournamentStats(completed).completed).toBe(capacity - 1);
    expect(getRanking(completed).reduce((sum, p) => sum + p.wins, 0)).toBe(
      capacity - 1,
    );
    expect(getRanking(completed).reduce((sum, p) => sum + p.played, 0)).toBe(
      2 * (capacity - 1),
    );

    const reopened = reopenApp();
    await reopened.persist.rehydrate();
    expect(reopened.getState().tournaments).toEqual(
      store.getState().tournaments,
    );
    expect(reopened.getState().profile).toEqual(profile);
    expect(reopened.getState().draft).toEqual(store.getState().draft);
    expect(
      getRanking(reopened.getState().tournaments.find((t) => t.id === id)!),
    ).toEqual(getRanking(completed));
    reopened.getState().score(id, completed.matches[0].id, 0, 4);
    const corrected = reopened.getState().tournaments.find((t) => t.id === id)!;
    expect(corrected.status).toBe("active");
    expect(corrected.championId).toBeUndefined();
    expect(corrected.matches.at(-1)!.winnerId).toBeNull();
    expect(
      reopened.getState().tournaments.find((t) => t.id === otherId),
    ).toEqual(other);
    expect(validatePersisted(reopened.getState())).toBe(true);

    const afterCorrection = reopenApp();
    await afterCorrection.persist.rehydrate();
    expect(afterCorrection.getState().tournaments).toEqual(
      reopened.getState().tournaments,
    );
    expect(afterCorrection.getState().draft.name).toBe("Próximo campeonato");
  },
);
