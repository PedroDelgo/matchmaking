import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Shell } from "../components/Shell";
import { Text, Button, PageHeading, EmptyState, Field } from "../components/ui";
import { TournamentGrid } from "../components/TournamentGrid";
import { useAppStore } from "../store/useAppStore";
import { colors } from "../theme/tokens";
import { useRemoteTournaments } from "../features/tournaments/remote/RemoteProvider";
import { CloudListNotice } from "../components/CloudListNotice";
export function TournamentsScreen() {
  const remote = useRemoteTournaments(),
    [source, setSource] = useState("all");
  const all = useAppStore((s) => s.tournaments),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const list = all.filter(
    (t) =>
      source !== "cloud" &&
      (filter === "all" || t.status === filter) &&
      t.name
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const cloud = remote.items.filter(
    (t) =>
      source !== "local" &&
      (filter === "all" || t.status === filter) &&
      t.name
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const count = list.length + cloud.length,
    total = all.length + remote.items.length;
  return (
    <Shell>
      <PageHeading
        eyebrow="SUA ARENA"
        title="Meus campeonatos"
        description="Toda disputa tem uma história. Organize a próxima por aqui."
        action={
          <Button
            label="Criar campeonato"
            icon="add"
            onPress={() => router.push("/tournament/create")}
          />
        }
      />
      <View style={{ gap: 20, marginBottom: 28 }}>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {[
            { id: "all", label: "Todas as origens" },
            { id: "local", label: "Neste dispositivo" },
            { id: "cloud", label: "Na nuvem" },
          ].map((s) => (
            <Button
              key={s.id}
              label={s.label}
              variant={source === s.id ? "secondary" : "outline"}
              accessibilityState={{ selected: source === s.id }}
              onPress={() => setSource(s.id)}
            />
          ))}
        </View>
        <Field
          label="Buscar campeonato"
          placeholder="Procure pelo nome"
          value={search}
          onChangeText={setSearch}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            { id: "all", label: "Todos" },
            { id: "draft", label: "Em preparação" },
            { id: "active", label: "Em andamento" },
            { id: "completed", label: "Concluídos" },
          ].map((f) => (
            <Button
              key={f.id}
              label={f.label}
              variant={filter === f.id ? "secondary" : "outline"}
              accessibilityState={{ selected: filter === f.id }}
              onPress={() => setFilter(f.id)}
            />
          ))}
        </View>
      </View>
      <CloudListNotice />
      {source === "cloud" && !remote.client ? (
        <Text style={{ marginBottom: 20 }}>
          Entre na sua conta para acessar seus campeonatos na nuvem. Os
          campeonatos deste dispositivo continuam disponíveis.
        </Text>
      ) : null}
      {count ? (
        <>
          <Text
            variant="caption"
            color={colors.muted}
            style={{ marginBottom: 16 }}
          >
            {count} campeonato{count === 1 ? "" : "s"}
          </Text>
          <TournamentGrid tournaments={list} summaries={cloud} />
        </>
      ) : (
        <EmptyState
          title={
            total
              ? "Nenhum campeonato por aqui."
              : "Seu primeiro campeonato começa aqui."
          }
          description={
            total
              ? "Tente outro nome ou filtro."
              : "Crie uma disputa e transforme a resenha em campeonato."
          }
          actionLabel={total ? "Limpar filtros" : "Criar campeonato"}
          onAction={() =>
            total
              ? (setFilter("all"), setSearch(""), setSource("all"))
              : router.push("/tournament/create")
          }
        />
      )}
    </Shell>
  );
}
