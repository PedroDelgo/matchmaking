import type { Tournament } from "./types";
export function participantLabel(
  t: Tournament,
  id: string | null | undefined,
): string {
  const p = t.participants.find((p) => p.id === id);
  if (!p) return "A definir";
  const duplicate =
    t.participants.filter(
      (other) =>
        other.displayName.toLocaleLowerCase("pt-BR") ===
        p.displayName.toLocaleLowerCase("pt-BR"),
    ).length > 1;
  return duplicate
    ? `${p.displayName} · ${t.participants.indexOf(p) + 1}`
    : p.displayName;
}
