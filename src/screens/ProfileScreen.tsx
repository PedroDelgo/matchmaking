import React, { useState } from "react";
import { View } from "react-native";
import { Shell } from "../components/Shell";
import {
  Text,
  Button,
  Panel,
  Field,
  Avatar,
  PageHeading,
  Notice,
  Chip,
} from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { getRanking } from "../features/tournaments/engine/tournament";
import { colors } from "../theme/tokens";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { expo } from "../../app.json";
export function ProfileScreen() {
  const profile = useAppStore((s) => s.profile),
    tournaments = useAppStore((s) => s.tournaments),
    update = useAppStore((s) => s.updateProfile);
  const [name, setName] = useState(profile.nickname),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const { tablet: wide } = useResponsiveLayout();
  const associated = tournaments.filter((t) =>
    t.participants.some((p) => p.profileId === profile.id),
  );
  const entries = associated.flatMap((t) => {
    const id = t.participants.find((p) => p.profileId === profile.id)!.id;
    return getRanking(t).filter((p) => p.participantId === id);
  });
  const wins = entries.reduce((s, p) => s + p.wins, 0),
    played = entries.reduce((s, p) => s + p.played, 0),
    titles = associated.filter((t) =>
      t.participants.some(
        (p) => p.id === t.championId && p.profileId === profile.id,
      ),
    ).length;
  return (
    <Shell>
      <PageHeading
        eyebrow="SEU ESPAÇO"
        title="Perfil de competidor"
        description="Um apelido, muitas disputas para contar."
      />
      <View style={{ flexDirection: wide ? "row" : "column", gap: 24 }}>
        <Panel style={{ flex: 1, gap: 24 }}>
          <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
            <Avatar name={profile.nickname} size={72} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="title">{profile.nickname}</Text>
              <Chip label="Perfil local" />
            </View>
          </View>
          <Field
            label="Seu apelido"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setSaved(false);
              setError("");
            }}
            maxLength={40}
            error={error}
          />
          <Button
            label="Salvar perfil"
            icon="checkmark"
            onPress={() => {
              try {
                update(name);
                setSaved(true);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
          {saved && <Notice tone="success" message="Apelido atualizado." />}
          <Text variant="caption" color={colors.muted}>
            Para contar suas estatísticas, use “Eu também vou jogar” na sala do
            campeonato. Apelidos iguais não vinculam perfis automaticamente.
          </Text>
        </Panel>
        <View style={{ flex: 1, gap: 20 }}>
          <Panel style={{ gap: 22 }}>
            <Text variant="title">Sua trajetória</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {[
                { n: associated.length, label: "Disputas" },
                { n: wins, label: "Vitórias" },
                { n: titles, label: "Títulos" },
              ].map((s) => (
                <View key={s.label} style={{ flex: 1, gap: 4 }}>
                  <Text
                    variant="display"
                    style={{ fontSize: 42, lineHeight: 46 }}
                  >
                    {s.n}
                  </Text>
                  <Text variant="caption" color={colors.muted}>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
            <Text color={colors.muted}>
              {played
                ? `${played} partidas disputadas · ${Math.round((wins / played) * 100)}% de aproveitamento`
                : "Participe de um campeonato para começar sua história."}
            </Text>
          </Panel>
          <Panel style={{ gap: 14 }}>
            <View
              style={{
                flexDirection: wide ? "row" : "column",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text variant="heading">Sobre sua arena</Text>
              <Chip label={`v${expo.version}`} />
            </View>
            <Text color={colors.muted}>
              O Matchmaking organiza disputas entre amigos. Seus campeonatos e
              este perfil ficam neste dispositivo, sem login ou sincronização.
              Limpar os dados do aplicativo pode apagar esse histórico.
            </Text>
          </Panel>
        </View>
      </View>
    </Shell>
  );
}
