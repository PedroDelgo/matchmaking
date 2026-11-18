export type TournamentCapacity = 4 | 8 | 16;
export type TournamentStatus = "draft" | "active" | "completed";
export interface Participant {
  id: string;
  displayName: string;
  profileId?: string;
  createdAt: string;
}
export interface Match {
  id: string;
  tournamentId: string;
  roundIndex: number;
  positionIndex: number;
  participant1Id: string | null;
  participant2Id: string | null;
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  status: "waiting" | "ready" | "completed";
  nextMatchId: string | null;
}
export interface Round {
  id: string;
  index: number;
  label: string;
  matchIds: string[];
  status: "waiting" | "active" | "completed";
}
export interface Tournament {
  id: string;
  name: string;
  modality: string;
  capacity: TournamentCapacity;
  status: TournamentStatus;
  participants: Participant[];
  rounds: Round[];
  matches: Match[];
  drawOrder: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  championId?: string;
}
export interface CreateTournamentInput {
  name: string;
  modality: string;
  capacity: TournamentCapacity;
}
export interface RankingEntry {
  position: number;
  participantId: string;
  displayName: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  balance: number;
  winRate: number;
  longestWinStreak: number;
}
