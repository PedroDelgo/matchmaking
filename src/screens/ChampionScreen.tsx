import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Shell } from "../components/Shell";
import { Text, Button, Panel, EmptyState, Notice } from "../components/ui";
import { ChampionReveal } from "../components/ChampionReveal";
import { MissingTournament } from "../components/tournament";
import { useTournament } from "../features/tournaments/useTournament";
import { RemoteTournamentNotice } from "../components/RemoteTournamentNotice";
import { getRanking } from "../features/tournaments/engine/tournament";
import { shareText } from "../utils/share";
import { colors } from "../theme/tokens";

export function ChampionScreen() {
  const source = useTournament(),
    t = source.tournament;
  const [feedback, setFeedback] = useState(""),
    [shareFallback, setShareFallback] = useState(false),
    [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (!t)
    return (
      <Shell>
        {source.cloud ? (
          <RemoteTournamentNotice source={source} />
        ) : (
          <MissingTournament />
        )}
      </Shell>
    );
  const champion = t.participants.find((p) => p.id === t.championId),
    entry = getRanking(t).find((p) => p.participantId === t.championId);
  if (!champion || !entry)
    return (
      <Shell>
        <EmptyState
          title="O troféu ainda está em jogo."
          description="Conclua a final para descobrir quem leva esse campeonato."
          actionLabel="Ver chaveamento"
          onAction={() => router.dismissTo(source.href("bracket"))}
        />
      </Shell>
    );
  const final = t.matches.find(
      (match) => match.nextMatchId === null && match.status === "completed",
    ),
    finalist1 = t.participants.find(
      (participant) => participant.id === final?.participant1Id,
    ),
    finalist2 = t.participants.find(
      (participant) => participant.id === final?.participant2Id,
    );
  // Only a different final result creates another presentation. Other store or
  // sharing updates keep the mounted sequence and never replay the celebration.
  const revealKey = `${t.id}:${champion.id}:${final?.id}:${final?.score1}:${final?.score2}:${final?.winnerId}`;
  const message = `${champion.displayName} venceu ${t.name} no Matchmaking! ${entry.wins} vitórias e ${entry.pointsFor} pontos na disputa de ${t.modality}.`;
  return (
    <Shell>
      <RemoteTournamentNotice source={source} />
      <ChampionReveal
        key={revealKey}
        runKey={revealKey}
        championName={champion.displayName}
        tournamentName={t.name}
        modality={t.modality}
        entry={entry}
        finalResult={
          final &&
          finalist1 &&
          finalist2 &&
          final.score1 !== null &&
          final.score2 !== null
            ? {
                name1: finalist1.displayName,
                name2: finalist2.displayName,
                score1: final.score1,
                score2: final.score2,
              }
            : null
        }
        actions={
          <>
            <Button
              label="Compartilhar conquista"
              icon="share-social-outline"
              loading={sharing}
              onPress={async () => {
                if (sharingRef.current) return;
                sharingRef.current = true;
                setSharing(true);
                setShareFallback(false);
                setFeedback("");
                try {
                  const result = await shareText(message);
                  if (!mounted.current) return;
                  setFeedback(
                    result === "copied"
                      ? "Texto copiado. Cole onde quiser compartilhar."
                      : result === "shared"
                        ? "Compartilhamento aberto."
                        : "",
                  );
                } catch {
                  if (!mounted.current) return;
                  setShareFallback(true);
                  setFeedback(
                    "Selecione o texto abaixo para copiar e compartilhar.",
                  );
                } finally {
                  sharingRef.current = false;
                  if (mounted.current) setSharing(false);
                }
              }}
            />
            <Button
              label="Ver todos os resultados"
              variant="outline"
              style={{ backgroundColor: colors.white }}
              onPress={() => router.dismissTo(source.href("bracket"))}
            />
          </>
        }
      />
      {!!feedback && (
        <View style={{ marginTop: 16 }}>
          <Notice message={feedback} />
        </View>
      )}
      {shareFallback && (
        <Panel style={{ marginTop: 16 }}>
          <Text selectable>{message}</Text>
        </Panel>
      )}
    </Shell>
  );
}
