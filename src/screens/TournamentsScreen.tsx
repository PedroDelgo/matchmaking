import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Shell } from "../components/Shell";
import { Text, Button, PageHeading, EmptyState, Field } from "../components/ui";
import { TournamentGrid } from "../components/TournamentGrid";
import { useAppStore } from "../store/useAppStore";
import { colors } from "../theme/tokens";
export function TournamentsScreen() {
  const all = useAppStore((s) => s.tournaments),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const list = all.filter(
    (t) =>
      (filter === "all" || t.status === filter) &&
      t.name
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
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
      {list.length ? (
        <>
          <Text
            variant="caption"
            color={colors.muted}
            style={{ marginBottom: 16 }}
          >
            {list.length} campeonato{list.length === 1 ? "" : "s"}
          </Text>
          <TournamentGrid tournaments={list} />
        </>
      ) : (
        <EmptyState
          title={
            all.length
              ? "Nenhum campeonato por aqui."
              : "Seu primeiro campeonato começa aqui."
          }
          description={
            all.length
              ? "Tente outro nome ou filtro."
              : "Crie uma disputa e transforme a resenha em campeonato."
          }
          actionLabel={all.length ? "Limpar filtros" : "Criar campeonato"}
          onAction={() =>
            all.length
              ? (setFilter("all"), setSearch(""))
              : router.push("/tournament/create")
          }
        />
      )}
    </Shell>
  );
}
