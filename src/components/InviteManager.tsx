import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../features/auth/AuthProvider";
import { useRemoteTournaments } from "../features/tournaments/remote/RemoteProvider";
import type {
  AdmittedMember,
  InvitationManagementResult,
  InvitationSummary,
} from "../features/tournaments/remote/client";
import type { Tournament } from "../features/tournaments/domain/types";
import { validatedInvitationUrl } from "../features/invites/credential";
import { colors } from "../theme/tokens";
import { InviteQr } from "./InviteQr";
import { Button, Chip, ConfirmDialog, Field, Notice, Panel, Text } from "./ui";
import { SelectionCard } from "./SelectionCard";

type Props = {
  tournamentId: string;
  canManage: boolean;
  status?: Tournament["status"];
};
const roleLabel = { participant: "Para jogar", viewer: "Para assistir" };
const stateLabel = {
  active: "Ativo",
  expired: "Expirado",
  revoked: "Revogado",
  exhausted: "Esgotado",
};
const date = (value: string) => new Date(value).toLocaleString("pt-BR");
export function InviteManager(props: Props) {
  const auth = useAuth();
  return (
    <InviteManagerBody
      key={`${props.tournamentId}|${auth.session?.user.id ?? ""}`}
      {...props}
    />
  );
}
function InviteManagerBody({
  tournamentId,
  canManage,
  status = "draft",
}: Props) {
  const remote = useRemoteTournaments();
  const { client } = remote;
  const sync = remote.syncById?.[tournamentId];
  const [invites, setInvites] = useState<InvitationSummary[]>([]),
    [members, setMembers] = useState<AdmittedMember[]>([]),
    [role, setRole] = useState<"participant" | "viewer">(
      status === "draft" ? "participant" : "viewer",
    ),
    [hours, setHours] = useState("24"),
    [uses, setUses] = useState("16"),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [secret, setSecret] = useState<InvitationManagementResult | null>(null),
    [confirm, setConfirm] = useState<{
      type: "revoke_invite" | "remove_member";
      id: string;
      name: string;
    } | null>(null);
  const live = useRef(true),
    submitting = useRef(false),
    refreshGeneration = useRef(0);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const checkPending = useCallback(async () => {
    if (!client || !canManage) return;
    try {
      const value = await client.hasPendingInvitationManagement(tournamentId);
      if (live.current) setPending(value);
    } catch {
      if (live.current)
        setError(
          "Não foi possível consultar a tentativa anterior. Verifique o armazenamento antes de criar outro convite.",
        );
    }
  }, [client, canManage, tournamentId]);
  const refresh = useCallback(
    async (includeDetail = true) => {
      if (!client) return;
      const generation = ++refreshGeneration.current;
      setRefreshing(true);
      setError("");
      const results = await Promise.allSettled([
        includeDetail
          ? client.detail(tournamentId, true)
          : Promise.resolve(null),
        ...(canManage
          ? [
              client.invitationList(tournamentId, "invites"),
              client.invitationList(tournamentId, "members"),
            ]
          : []),
      ]);
      if (!live.current || generation !== refreshGeneration.current) return;
      if (canManage) {
        const invitations = results[1],
          admitted = results[2];
        if (invitations?.status === "fulfilled") {
          const items = (invitations.value as { items: InvitationSummary[] })
            .items;
          setInvites(items);
          setSecret((current) =>
            current?.invite &&
            items.some(
              (item) =>
                item.id === current.invite!.id && item.status !== "active",
            )
              ? null
              : current,
          );
        }
        if (admitted?.status === "fulfilled")
          setMembers((admitted.value as { items: AdmittedMember[] }).items);
      }
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected")
        setError(
          failed.reason instanceof Error
            ? failed.reason.message
            : "Não foi possível atualizar os acessos. Os dados confirmados continuam disponíveis.",
        );
      setRefreshing(false);
      await checkPending();
    },
    [client, tournamentId, canManage, checkPending],
  );
  useEffect(() => {
    if (!canManage || !sync?.accessSequence || sync.status !== "connected")
      return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh(false);
    });
    return () => {
      active = false;
    };
  }, [canManage, sync?.accessSequence, sync?.status, refresh]);
  useEffect(
    () => () => {
      refreshGeneration.current++;
    },
    [client, canManage],
  );
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active && canManage) void refresh();
    });
    return () => {
      active = false;
    };
  }, [canManage, refresh]);
  const manage = async (
    type: "create_invite" | "revoke_invite" | "remove_member" | "retry",
    payload: Record<string, unknown> = {},
  ) => {
    if (!client || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setConfirm(null);
    if (type === "create_invite") setSecret(null);
    try {
      const result =
        type === "retry"
          ? await client.retryInvitationManagement(tournamentId)
          : await client.manageInvitation(tournamentId, type, payload);
      if (!live.current) return;
      if (result.invite && result.invite.status !== "active")
        setSecret((current) =>
          current?.invite?.id === result.invite!.id ? null : current,
        );
      if (result.shareUrl && result.code) {
        validatedInvitationUrl(result.shareUrl);
        setSecret(result);
        setNotice(
          "Convite criado. Guarde ou compartilhe o link e o código agora; eles não poderão ser recuperados depois.",
        );
      } else {
        if (type === "revoke_invite" && secret?.invite?.id === payload.inviteId)
          setSecret(null);
        setNotice(
          result.replayed
            ? "A operação anterior foi confirmada. Links e códigos são exibidos apenas uma vez; se não os guardou, revogue o convite e crie outro."
            : type === "remove_member"
              ? "Acesso removido. O convite não foi revogado por esta ação."
              : "Convite revogado. Quem já foi admitido mantém seu acesso.",
        );
      }
      if (result.journalPending)
        setNotice(
          "O servidor confirmou a operação. Repita a tentativa pendente para concluir o registro local com segurança.",
        );
      await refresh();
    } catch (reason) {
      if (live.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível confirmar esta operação. Tente novamente.",
        );
    } finally {
      submitting.current = false;
      if (live.current) {
        setBusy(false);
        await checkPending();
      }
    }
  };
  const create = () => {
    const expiresInHours = Number(hours),
      maxUses = Number(uses);
    if (
      !/^\d+$/.test(hours) ||
      !/^\d+$/.test(uses) ||
      expiresInHours < 1 ||
      expiresInHours > 168 ||
      maxUses < 1 ||
      maxUses > 100
    ) {
      setError("Escolha validade de 1 a 168 horas e de 1 a 100 utilizações.");
      return;
    }
    void manage("create_invite", {
      role: status === "draft" ? role : "viewer",
      expiresInHours,
      maxUses,
    });
  };
  const copy = async (value: string, message: string) => {
    try {
      const copied = await Clipboard.setStringAsync(value);
      if (!copied) throw new Error();
      if (live.current) {
        setNotice(message);
        setError("");
      }
    } catch {
      if (live.current)
        setError(
          "Não foi possível copiar. Tente novamente ou selecione o código exibido.",
        );
    }
  };
  const share = async () => {
    if (!secret?.shareUrl) return;
    try {
      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && navigator.share)
          await navigator.share({
            title: "Convite Matchmaking",
            url: secret.shareUrl,
          });
        else await copy(secret.shareUrl, "Link copiado para compartilhar.");
      } else
        await Share.share({
          message: secret.shareUrl,
          title: "Convite Matchmaking",
        });
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      if (live.current)
        setError("Não foi possível abrir o compartilhamento. Use Copiar link.");
    }
  };
  if (!canManage)
    return (
      <Panel style={{ gap: 12, marginBottom: 24 }}>
        <Text variant="heading">Você acompanha esta disputa</Text>
        <Text color={colors.muted}>
          Só o organizador altera participantes, chave e resultados. A conexão
          acompanha as alterações confirmadas; você também pode atualizar
          manualmente.
        </Text>
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          label="Atualizar campeonato"
          variant="outline"
          icon="refresh-outline"
          loading={refreshing}
          onPress={() => void refresh()}
        />
      </Panel>
    );
  return (
    <Panel style={{ gap: 18, marginBottom: 24 }}>
      <View style={{ gap: 8 }}>
        <Text variant="label" color={colors.primaryDark}>
          CONVIDE SEUS RIVAIS
        </Text>
        <Text variant="heading">A próxima disputa começa com um convite.</Text>
        <Text color={colors.muted}>
          Escolha quem joga e quem acompanha. Com a conexão ativa, a sala
          acompanha as entradas confirmadas automaticamente.
        </Text>
      </View>
      {error ? <Notice tone="error" message={error} /> : null}
      {notice ? <Notice tone="success" message={notice} /> : null}
      {pending ? (
        <Button
          label="Repetir gestão pendente"
          variant="outline"
          loading={busy}
          onPress={() => void manage("retry")}
        />
      ) : null}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Tipo de convite"
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
      >
        {status === "draft" ? (
          <SelectionCard
            label="Para jogar"
            icon="game-controller-outline"
            selected={role === "participant"}
            onPress={() => setRole("participant")}
            style={{ flex: 1, minWidth: 108 }}
          />
        ) : null}
        <SelectionCard
          label="Para assistir"
          icon="eye-outline"
          selected={status !== "draft" || role === "viewer"}
          onPress={() => setRole("viewer")}
          style={{ flex: 1, minWidth: 108 }}
        />
      </View>
      {status !== "draft" ? (
        <Text variant="caption" color={colors.muted}>
          A chave já começou. Novos convites permitem somente acompanhar.
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Field
          label="Validade em horas"
          value={hours}
          onChangeText={setHours}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={3}
          editable={!busy}
          helper="De 1 a 168 horas"
          containerStyle={{ flex: 1, minWidth: 110 }}
        />
        <Field
          label="Limite de utilizações"
          value={uses}
          onChangeText={setUses}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={3}
          editable={!busy}
          helper="De 1 a 100 entradas"
          containerStyle={{ flex: 1, minWidth: 110 }}
        />
      </View>
      <Button
        label="Criar convite"
        icon="add-outline"
        loading={busy}
        disabled={pending}
        onPress={create}
      />
      {secret?.shareUrl && secret.code ? (
        <View style={{ gap: 14 }}>
          <Text variant="title">Convite pronto para compartilhar</Text>
          {secret.development ? (
            <Notice message="Este link usa o servidor de desenvolvimento. Outro aparelho precisa alcançar esse endereço na mesma rede; ele não oferece acesso público pela internet." />
          ) : null}
          <InviteQr value={secret.shareUrl} />
          <Text
            selectable
            accessibilityLabel="Código do convite"
            variant="heading"
            style={{ textAlign: "center", letterSpacing: 4 }}
          >
            {secret.code.slice(0, 4)} {secret.code.slice(4)}
          </Text>
          <View style={{ gap: 8 }}>
            <Button
              label="Copiar link"
              variant="outline"
              icon="link-outline"
              onPress={() => void copy(secret.shareUrl!, "Link copiado.")}
            />
            <Button
              label="Copiar código"
              variant="outline"
              icon="copy-outline"
              onPress={() => void copy(secret.code!, "Código copiado.")}
            />
            <Button
              label="Compartilhar convite"
              icon="share-social-outline"
              onPress={() => void share()}
            />
          </View>
          <Text variant="caption" color={colors.muted}>
            O link e o código dão acesso a este convite. Compartilhe apenas com
            quem deseja admitir.
          </Text>
        </View>
      ) : null}
      <Button
        label="Atualizar acessos"
        variant="outline"
        icon="refresh-outline"
        loading={refreshing}
        disabled={busy}
        onPress={() => void refresh()}
      />
      <View style={{ gap: 12 }}>
        <Text variant="title">
          Convites · {invites.filter((i) => i.status === "active").length}{" "}
          ativos
        </Text>
        {invites.length ? (
          invites.map((invite) => (
            <View
              key={invite.id}
              style={{
                gap: 8,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text>{roleLabel[invite.role]}</Text>
                <Chip
                  label={stateLabel[invite.status]}
                  tone={invite.status === "active" ? "success" : "neutral"}
                />
              </View>
              <Text variant="caption" color={colors.muted}>
                Expira em {date(invite.expiresAt)} · {invite.uses}/
                {invite.maxUses} utilizações
              </Text>
              {invite.status === "active" ? (
                <Button
                  label="Revogar convite"
                  variant="outline"
                  disabled={busy}
                  onPress={() =>
                    setConfirm({
                      type: "revoke_invite",
                      id: invite.id,
                      name: roleLabel[invite.role],
                    })
                  }
                />
              ) : null}
            </View>
          ))
        ) : (
          <Text color={colors.muted}>Você ainda não criou convites.</Text>
        )}
      </View>
      <View style={{ gap: 12 }}>
        <Text variant="title">Acessos admitidos</Text>
        <Text variant="caption" color={colors.muted}>
          {members.filter((m) => m.role === "participant").length} jogadores
          vinculados · {members.filter((m) => m.role === "viewer").length}{" "}
          espectadores
        </Text>
        {members.length ? (
          members.map((member) => (
            <View
              key={member.userId}
              style={{
                gap: 8,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 12,
              }}
            >
              <Text>{member.displayName}</Text>
              <Chip
                label={member.role === "participant" ? "Jogador" : "Espectador"}
              />
              {member.participantId ? (
                <Text variant="caption" color={colors.muted}>
                  Para retirar o acesso, remova primeiro o jogador na lista do
                  campeonato enquanto estiver em preparação.
                </Text>
              ) : (
                <Button
                  label="Remover acesso"
                  variant="outline"
                  disabled={busy}
                  onPress={() =>
                    setConfirm({
                      type: "remove_member",
                      id: member.userId,
                      name: member.displayName,
                    })
                  }
                />
              )}
            </View>
          ))
        ) : (
          <Text color={colors.muted}>
            Ninguém entrou por convite ainda. Espectadores não ocupam vagas na
            chave.
          </Text>
        )}
      </View>
      <ConfirmDialog
        visible={!!confirm}
        title={
          confirm?.type === "remove_member"
            ? "Remover este acesso?"
            : "Revogar este convite?"
        }
        description={
          confirm?.type === "remove_member"
            ? `O acesso de ${confirm.name} será removido. Isso não revoga convites que ainda estejam válidos.`
            : "Novas entradas por este convite serão recusadas. Quem já entrou continuará com seu acesso."
        }
        confirmLabel={
          confirm?.type === "remove_member"
            ? "Remover acesso"
            : "Revogar convite"
        }
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          confirm &&
          void manage(
            confirm.type,
            confirm.type === "remove_member"
              ? { userId: confirm.id }
              : { inviteId: confirm.id },
          )
        }
      />
    </Panel>
  );
}
