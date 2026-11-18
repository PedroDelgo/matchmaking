import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useAppStore,
  emptyDraft,
  validatePersisted,
} from "../src/store/useAppStore";
import {
  createTournament,
  addParticipant,
  startTournament,
  recordResult,
} from "../src/features/tournaments/engine/tournament";

test.each([4, 8, 16] as const)(
  "rehidrata dados completos de %i participantes, resultados e perfil",
  async (capacity) => {
    let t = createTournament(
      { name: "Copa persistida", modality: "Futebol", capacity },
      `cup${capacity}`,
    );
    for (let i = 0; i < capacity; i++)
      t = addParticipant(t, `Jogador ${i}`, i === 0 ? "my-profile" : undefined);
    t = startTournament(t, () => 0.5);
    for (const m of t.matches) t = recordResult(t, m.id, 3, 1);
    const state = {
      tournaments: [t],
      profile: { id: "my-profile", nickname: "Pedro" },
      draft: { ...emptyDraft, name: "Rascunho" },
    };
    expect(validatePersisted(state)).toBe(true);
    useAppStore.setState(state);
    const saved = await AsyncStorage.getItem("matchmaking-local-v1");
    expect(saved).toBeTruthy();
    useAppStore.setState({ tournaments: [], draft: { ...emptyDraft } });
    await AsyncStorage.setItem("matchmaking-local-v1", saved!);
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().tournaments).toEqual([t]);
    expect(useAppStore.getState().draft.name).toBe("Rascunho");
  },
);
test("rejeita ciclos e campeão incompatível nos dados persistidos", () => {
  let t = createTournament(
    { name: "Copa", modality: "Futebol", capacity: 4 },
    "corrupt",
  );
  for (let i = 0; i < 4; i++) t = addParticipant(t, `Jogador ${i}`);
  t = startTournament(t);
  const state = {
    tournaments: [t],
    profile: { id: "me", nickname: "Pedro" },
    draft: emptyDraft,
  };
  expect(validatePersisted(state)).toBe(true);
  t.matches[0].nextMatchId = t.matches[0].id;
  expect(validatePersisted(state)).toBe(false);
});
test("dados corrompidos permanecem intactos e exibem erro de recuperação", async () => {
  const raw = "{quebrado";
  await AsyncStorage.setItem("matchmaking-local-v1", raw);
  await useAppStore.persist.rehydrate();
  expect(useAppStore.getState().hydrated).toBe(true);
  expect(useAppStore.getState().storageError).toMatch(/preservado/);
  useAppStore.getState().updateDraft({ name: "temporário" });
  expect(await AsyncStorage.getItem("matchmaking-local-v1")).toBe(raw);
});
