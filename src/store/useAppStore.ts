import { validateTournament } from "../features/tournaments/domain/validation";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { localStorageAdapter } from "./storage";
import type { Tournament } from "../features/tournaments/domain/types";
import {
  createTournament,
  addParticipant,
  removeParticipant,
  startTournament,
  recordResult,
} from "../features/tournaments/engine/tournament";

export type Draft = {
  name: string;
  modality: string;
  customModality: string;
  capacity: 4 | 8 | 16;
  step: number;
};
export const emptyDraft: Draft = {
  name: "",
  modality: "Futebol",
  customModality: "",
  capacity: 8,
  step: 0,
};
type Profile = { id: string; nickname: string };
type Persisted = { tournaments: Tournament[]; profile: Profile; draft: Draft };
type AppState = Persisted & {
  hydrated: boolean;
  storageError: string | null;
  setHydrated: () => void;
  setStorageError: (error: string | null) => void;
  updateDraft: (patch: Partial<Draft>) => void;
  resetDraft: () => void;
  updateProfile: (nickname: string) => void;
  create: () => string;
  add: (id: string, name: string, profileId?: string) => void;
  remove: (id: string, participantId: string) => void;
  fillExamples: (id: string) => void;
  start: (id: string) => void;
  score: (
    id: string,
    matchId: string,
    a: number,
    b: number,
    tie?: string,
  ) => void;
  deleteTournament: (id: string) => void;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
export function validatePersisted(v: unknown): v is Persisted {
  if (
    !isObject(v) ||
    !Array.isArray(v.tournaments) ||
    !isObject(v.profile) ||
    typeof v.profile.id !== "string" ||
    typeof v.profile.nickname !== "string" ||
    !isObject(v.draft)
  )
    return false;
  const d = v.draft;
  if (
    typeof d.name !== "string" ||
    typeof d.modality !== "string" ||
    typeof d.customModality !== "string" ||
    ![4, 8, 16].includes(d.capacity as number) ||
    !Number.isInteger(d.step) ||
    Number(d.step) < 0 ||
    Number(d.step) > 2
  )
    return false;
  const tournamentIds = new Set<string>();
  return v.tournaments.every((t) => {
    if (!validateTournament(t) || tournamentIds.has(t.id)) return false;
    tournamentIds.add(t.id);
    return true;
  });
}

const storageVersion = 1;
let storageBlocked = false;
const guardedStorage: StateStorage = {
  getItem: async (key) => {
    const raw = await localStorageAdapter.getItem(key);
    if (raw === null) return null;
    // Zustand treats a missing state in valid JSON as empty storage. Validate
    // the envelope first so hydration cannot overwrite the original contents.
    const envelope: unknown = JSON.parse(raw);
    if (
      !isObject(envelope) ||
      envelope.version !== storageVersion ||
      !validatePersisted(envelope.state)
    )
      throw new Error("Dados locais inválidos ou incompatíveis.");
    return raw;
  },
  setItem: async (key, value) => {
    if (storageBlocked) return;
    try {
      await localStorageAdapter.setItem(key, value);
    } catch {
      storageBlocked = true;
      useAppStore.setState({
        storageError:
          "Não foi possível salvar. Mantenha o app aberto e libere espaço no dispositivo. Recarregue para tentar novamente.",
      });
    }
  },
  removeItem: (key) => localStorageAdapter.removeItem(key),
};

function replace(id: string, update: (t: Tournament) => Tournament) {
  const all = useAppStore.getState().tournaments;
  if (!all.some((t) => t.id === id))
    throw new Error("Campeonato não encontrado.");
  useAppStore.setState({
    tournaments: all.map((t) => (t.id === id ? update(t) : t)),
  });
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tournaments: [],
      profile: {
        id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        nickname: "Organizador",
      },
      draft: { ...emptyDraft },
      hydrated: false,
      storageError: null,
      setHydrated: () => set({ hydrated: true }),
      setStorageError: (storageError) => set({ storageError }),
      updateDraft: (patch) => set({ draft: { ...get().draft, ...patch } }),
      resetDraft: () => set({ draft: { ...emptyDraft } }),
      updateProfile: (nickname) => {
        if (!nickname.trim()) throw new Error("Digite seu apelido.");
        set({
          profile: { ...get().profile, nickname: nickname.trim().slice(0, 40) },
        });
      },
      create: () => {
        const d = get().draft;
        const t = createTournament({
          name: d.name,
          modality: d.modality === "Outro" ? d.customModality : d.modality,
          capacity: d.capacity,
        });
        set({
          tournaments: [t, ...get().tournaments],
          draft: { ...emptyDraft },
        });
        return t.id;
      },
      add: (id, name, profileId) =>
        replace(id, (t) => addParticipant(t, name, profileId)),
      remove: (id, participantId) =>
        replace(id, (t) => removeParticipant(t, participantId)),
      fillExamples: (id) =>
        replace(id, (t) => {
          const names = [
            "Lucas",
            "Marina",
            "Rafael",
            "Bia",
            "André",
            "Camila",
            "Bruno",
            "Júlia",
            "Diego",
            "Letícia",
            "Caio",
            "Ana",
            "Felipe",
            "Lia",
            "Davi",
            "Sofia",
          ];
          let next = t;
          let i = 0;
          while (next.participants.length < next.capacity) {
            const name = names[i++ % names.length];
            if (!next.participants.some((p) => p.displayName === name))
              next = addParticipant(next, name);
            else if (i > 32) next = addParticipant(next, `${name} ${i}`);
          }
          return next;
        }),
      start: (id) => replace(id, (t) => startTournament(t)),
      score: (id, mid, a, b, tie) =>
        replace(id, (t) => recordResult(t, mid, a, b, tie)),
      deleteTournament: (id) =>
        set({ tournaments: get().tournaments.filter((t) => t.id !== id) }),
    }),
    {
      name: "matchmaking-local-v1",
      version: storageVersion,
      skipHydration: true,
      storage: createJSONStorage(() => guardedStorage),
      partialize: (s) => ({
        tournaments: s.tournaments,
        profile: s.profile,
        draft: s.draft,
      }),
      migrate: () => {
        throw new Error("Versão dos dados incompatível.");
      },
      merge: (persisted, current) => {
        if (persisted === undefined) return current;
        if (!validatePersisted(persisted))
          throw new Error("Dados locais inválidos.");
        return {
          ...current,
          tournaments: persisted.tournaments,
          profile: persisted.profile,
          draft: persisted.draft,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        // Defer so a failed read does not replace the original data during hydration.
        if (error) {
          storageBlocked = true;
          useAppStore.setState({
            hydrated: true,
            storageError:
              "Não conseguimos ler os dados salvos. O conteúdo original foi preservado. Recarregue para tentar novamente.",
          });
        } else useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

let hydrationStarted = false;
export function hydrateApp() {
  if (!hydrationStarted) {
    hydrationStarted = true;
    void useAppStore.persist.rehydrate();
  }
}
