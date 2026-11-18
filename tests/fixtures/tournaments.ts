import {
  createTournament,
  addParticipant,
  startTournament,
  recordResult,
} from "../../src/features/tournaments/engine/tournament";
import type { TournamentStatus } from "../../src/features/tournaments/domain/types";
export function tournamentFixture(status: TournamentStatus, id = status) {
  const names = {
    draft: "Copa de sábado",
    active: "Liga dos amigos",
    completed: "Desafio da praça",
  };
  let t = createTournament(
    { name: names[status], modality: "Futebol", capacity: 4 },
    id,
  );
  if (status === "draft") return t;
  for (const [i, name] of ["Ana", "Bia", "Caio", "Davi"].entries())
    t = addParticipant(t, name, i === 0 ? "me" : undefined);
  t = startTournament(t, () => 0.999);
  if (status === "completed")
    for (const m of t.matches) t = recordResult(t, m.id, 3, 1);
  return t;
}
