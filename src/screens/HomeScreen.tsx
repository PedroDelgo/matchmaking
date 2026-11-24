import React, { useState } from "react";
import { View, Pressable, Modal } from "react-native";
import { router } from "expo-router";
import { Shell } from "../components/Shell";
import {
  Text,
  Button,
  Panel,
  Icon,
  SectionTitle,
  EmptyState,
} from "../components/ui";
import { Motion } from "../components/Motion";
import { TournamentGrid } from "../components/TournamentGrid";
import { useAppStore } from "../store/useAppStore";
import { colors, fonts, typography } from "../theme/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useRemoteTournaments } from "../features/tournaments/remote/RemoteProvider";
import { CloudListNotice } from "../components/CloudListNotice";

function BracketArtwork() {
  return (
    <View
      accessible
      accessibilityLabel="Ilustração de um chaveamento rumo ao troféu"
      style={{
        width: 300,
        height: 260,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: 206,
          height: 206,
          borderRadius: 103,
          borderWidth: 1,
          borderColor: colors.graphicRing,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 264,
          height: 264,
          borderRadius: 132,
          borderWidth: 1,
          borderColor: colors.graphicRingOuter,
        }}
      />
      {[-1, 1].map((side) => (
        <View
          key={side}
          style={{
            position: "absolute",
            left: side === -1 ? 0 : undefined,
            right: side === 1 ? 0 : undefined,
            top: 65,
            width: 100,
            height: 132,
          }}
        >
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                top: i * 92,
                width: 70,
                height: 40,
                borderRadius: 6,
                backgroundColor: colors.white,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 5,
                  backgroundColor: colors.graphicLabel,
                  borderRadius: 2,
                }}
              />
            </View>
          ))}
          <View
            style={{
              position: "absolute",
              top: 20,
              left: side === -1 ? 70 : undefined,
              right: side === 1 ? 70 : undefined,
              width: 22,
              height: 92,
              borderWidth: 1,
              borderLeftWidth: side === -1 ? 0 : 1,
              borderRightWidth: side === 1 ? 0 : 1,
              borderColor: colors.graphicLine,
            }}
          />
        </View>
      ))}
      <View
        style={{
          width: 100,
          height: 120,
          backgroundColor: colors.primary,
          transform: [{ rotate: "-7deg" }],
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="trophy-outline" size={60} />
      </View>
      <View
        style={{
          position: "absolute",
          bottom: 10,
          backgroundColor: colors.ink,
          paddingHorizontal: 14,
          paddingVertical: 8,
          transform: [{ rotate: "-3deg" }],
        }}
      >
        <Text variant="label" color={colors.white}>
          A resenha vale um troféu.
        </Text>
      </View>
    </View>
  );
}
export function HomeScreen() {
  const remote = useRemoteTournaments(),
    [source, setSource] = useState("all");
  const reduced = useReducedMotion();
  const tournaments = useAppStore((s) => s.tournaments),
    profile = useAppStore((s) => s.profile);
  const [join, setJoin] = useState(false),
    { desktop: wide, tablet, compact } = useResponsiveLayout();
  const total = tournaments.length + remote.items.length;
  const ongoing = [...tournaments, ...remote.items].filter(
      (t) => t.status === "active",
    ).length,
    finished = [...tournaments, ...remote.items].filter(
      (t) => t.status === "completed",
    ).length;
  return (
    <Shell>
      <Motion>
        <View
          style={{
            flexDirection: wide ? "row" : "column",
            justifyContent: "space-between",
            alignItems: wide ? "center" : "flex-start",
            gap: 8,
            marginBottom: 24,
          }}
        >
          <Text variant="caption" color={colors.muted}>
            Bom te ver por aqui, {profile.nickname}.
          </Text>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.primary,
              }}
            />
            <Text variant="label" color={colors.muted}>
              Sua arena de amigos
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: wide ? "row" : "column",
            backgroundColor: colors.backgroundSecondary,
            borderRadius: 16,
            overflow: "hidden",
            padding: wide ? 44 : 24,
            alignItems: wide ? "center" : undefined,
            minHeight: wide ? 350 : undefined,
          }}
        >
          <View style={{ flex: 1, gap: 18, zIndex: 1 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  height: 2,
                  width: 22,
                  backgroundColor: colors.primary,
                }}
              />
              <Text variant="label">A DISPUTA COMEÇA AQUI</Text>
            </View>
            <Text
              variant="display"
              accessibilityRole="header"
              style={
                wide
                  ? typography.hero.desktop
                  : tablet
                    ? typography.hero.tablet
                    : typography.hero.mobile
              }
            >
              Bora competir?
            </Text>
            <Text
              color={colors.muted}
              style={{
                maxWidth: 400,
                fontSize: wide ? 16 : 14,
                lineHeight: 26,
              }}
            >
              Crie campeonatos, desafie seus amigos e descubra quem é o melhor.
            </Text>
            <View
              style={{
                flexDirection: wide ? "row" : "column",
                gap: 10,
                alignItems: wide ? "center" : "flex-start",
                marginTop: 6,
              }}
            >
              <Button
                label="Criar campeonato"
                size="large"
                style={compact ? { alignSelf: "stretch" } : undefined}
                icon="add"
                onPress={() => router.push("/tournament/create")}
              />
              <Button
                label="Entrar com código"
                variant="ghost"
                icon="enter-outline"
                onPress={() => setJoin(true)}
              />
            </View>
          </View>
          {wide && (
            <View style={{ width: 380, alignItems: "center" }}>
              <BracketArtwork />
            </View>
          )}
        </View>
      </Motion>
      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: 24,
          marginBottom: 32,
        }}
      >
        {[
          {
            n: total,
            label: "Campeonatos",
            icon: "trophy-outline" as const,
          },
          { n: ongoing, label: "Em andamento", icon: "flash-outline" as const },
          {
            n: finished,
            label: "Concluídos",
            icon: "checkmark-circle-outline" as const,
          },
        ].map((stat, i) => (
          <View
            key={stat.label}
            style={{
              flex: 1,
              flexDirection: wide ? "row" : "column",
              alignItems: wide ? "center" : "flex-start",
              gap: wide ? 14 : 6,
              paddingLeft: i ? (wide ? 32 : 16) : 0,
              borderLeftWidth: i ? 1 : 0,
              borderLeftColor: colors.border,
            }}
          >
            {wide && <Icon name={stat.icon} size={24} color={colors.muted} />}
            <Text variant="title" style={{ fontSize: 34, lineHeight: 38 }}>
              {String(stat.n).padStart(2, "0")}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 28 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SectionTitle
            title="Meus campeonatos"
            action={total ? "Ver todos" : undefined}
            onAction={() => router.navigate("/tournaments")}
          />
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 20,
            }}
          >
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
          <CloudListNotice />
          {source === "cloud" && remote.items.length === 0 ? (
            <EmptyState
              title="Seus campeonatos na nuvem aparecem aqui."
              description={
                remote.client
                  ? "Crie uma disputa na sua conta ou salve uma cópia de um campeonato deste dispositivo."
                  : "Entre na sua conta para guardar e recuperar suas disputas."
              }
              actionLabel={
                remote.client ? "Criar campeonato" : "Entrar na minha conta"
              }
              onAction={() =>
                router.push(
                  remote.client ? "/tournament/create" : "/auth/sign-in",
                )
              }
            />
          ) : source === "local" && tournaments.length === 0 ? (
            <EmptyState
              title="Nenhum campeonato neste dispositivo."
              description="Você pode criar uma disputa local sem conta e sem internet."
              actionLabel="Criar campeonato"
              onAction={() => router.push("/tournament/create")}
            />
          ) : total ? (
            <TournamentGrid
              tournaments={
                source === "cloud"
                  ? []
                  : tournaments.slice(
                      0,
                      source === "all" && remote.items.length ? 2 : 3,
                    )
              }
              summaries={
                source === "local"
                  ? []
                  : remote.items.slice(
                      0,
                      source === "all" && tournaments.length ? 1 : 3,
                    )
              }
            />
          ) : (
            <EmptyState
              title="Seu primeiro campeonato começa aqui."
              description="Junte a galera. Escolha a disputa. O resto a gente organiza com você."
              actionLabel="Criar meu primeiro campeonato"
              onAction={() => router.push("/tournament/create")}
            />
          )}
        </View>
        {!total && (
          <View style={{ width: wide ? 320 : undefined, gap: 20 }}>
            <Text variant="title" style={{ marginBottom: -2 }}>
              Da ideia ao pódio
            </Text>
            <Panel style={{ gap: 24 }}>
              {[
                {
                  n: "01",
                  title: "Escolha a disputa",
                  text: "Do futebol ao truco. A modalidade é sua.",
                },
                {
                  n: "02",
                  title: "Reúna os amigos",
                  text: "Adicione 4, 8 ou 16 participantes.",
                },
                {
                  n: "03",
                  title: "Que vença o melhor",
                  text: "Sorteie, registre os placares e celebre.",
                },
              ].map((item) => (
                <View key={item.n} style={{ flexDirection: "row", gap: 14 }}>
                  <Text
                    variant="title"
                    color={colors.primaryDark}
                    style={{ fontSize: 27 }}
                  >
                    {item.n}
                  </Text>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontFamily: fonts.semibold }}>
                      {item.title}
                    </Text>
                    <Text variant="caption" color={colors.muted}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              ))}
            </Panel>
            <View
              style={{ flexDirection: "row", gap: 10, paddingHorizontal: 4 }}
            >
              <Icon name="phone-portrait-outline" color={colors.muted} />
              <Text variant="caption" color={colors.muted} style={{ flex: 1 }}>
                Seus campeonatos ficam neste dispositivo. Prontos para a próxima
                resenha.
              </Text>
            </View>
          </View>
        )}
      </View>
      <View
        style={{
          marginTop: 36,
          paddingTop: 24,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          gap: 16,
        }}
      >
        <Text variant="label" color={colors.muted}>
          Qualquer jogo. A mesma vontade de ganhar.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 24 }}>
          {[
            { name: "Futebol", icon: "football-outline" as const },
            { name: "Videogame", icon: "game-controller-outline" as const },
            { name: "Basquete", icon: "basketball-outline" as const },
            { name: "Truco", icon: "copy-outline" as const },
            { name: "Xadrez", icon: "extension-puzzle-outline" as const },
            { name: "E muito mais", icon: "add-outline" as const },
          ].map((item) => (
            <Pressable
              key={item.name}
              accessibilityRole="button"
              accessibilityLabel={`Criar campeonato de ${item.name}`}
              onPress={() => {
                useAppStore.getState().updateDraft({
                  modality: item.name === "E muito mais" ? "Outro" : item.name,
                });
                router.push("/tournament/create");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
              }}
            >
              <Icon name={item.icon} size={20} color={colors.muted} />
              <Text variant="caption" color={colors.muted}>
                {item.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Modal
        visible={join}
        transparent
        animationType={reduced ? "none" : "fade"}
        onRequestClose={() => setJoin(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.overlay,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Panel style={{ maxWidth: 420, width: "100%", gap: 16 }}>
            <Icon name="enter-outline" size={32} color={colors.primaryDark} />
            <Text variant="title">A galera vai poder entrar.</Text>
            <Text color={colors.muted}>
              Convites por código, link e QR Code estarão disponíveis em uma
              próxima versão. Por enquanto, adicione os participantes no seu
              dispositivo.
            </Text>
            <Button label="Entendi" onPress={() => setJoin(false)} />
          </Panel>
        </View>
      </Modal>
    </Shell>
  );
}
