import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { go } from '../../lib/nav';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as api from '../../api';
import type { CancelReason, FriendEntry, MatchDetail } from '../../api/types';
import { AvatarIcon } from '../../avatar/AvatarView';
import { ChatIcon } from '../../components/chat';
import { GameTile, SquadSlots } from '../../components/pixel';
import {
  Box,
  Chip,
  ConfirmSheet,
  Empty,
  ErrorText,
  LoadState,
  Note,
  PixelButton,
  Screen,
  SectionHeader,
  Sheet,
  SmallButton,
  T,
  Tag,
  TopBar,
  codeInput,
} from '../../components/ui';
import { useDraft } from '../../context/DraftContext';
import { deviceTimeZone } from '../../lib/clock';
import { formatDate, formatDuration, formatTime } from '../../lib/dates';
import { useAction, useNow, useRemote } from '../../lib/hooks';
import { canEditOrCancel, isActive, liveStatus, squadText, statusTag } from '../../lib/status';
import { CANCEL_REASONS, colors, font, PLATFORM_NAME, FONT_SCALE_MAX } from '../../theme';

type Panel = null | 'invite' | 'kick' | 'cancel' | 'end' | 'leave';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const now = useNow(15000);
  const { loadFromMatch } = useDraft();
  const remote = useRemote(() => api.getMatch(matchId), [matchId], { live: true });
  const action = useAction();
  const [panel, setPanel] = useState<Panel>(null);
  const [copied, setCopied] = useState(false);

  const m = remote.data;
  if (!m) {
    return (
      <Screen>
        <TopBar />
        <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      </Screen>
    );
  }

  const st = liveStatus(m, now);
  const active = isActive(st);
  const host = m.my_role === 'host';
  const member = host || m.my_role === 'member';
  const minsToStart = Math.ceil((new Date(m.starts_at).getTime() - now.getTime()) / 60000);
  const hostMember = m.members.find((x) => x.is_host);

  const tag =
    m.my_role === 'left'
      ? { label: 'VOCÊ SAIU', bg: colors.host }
      : m.my_role === 'kicked'
        ? { label: 'VOCÊ FOI REMOVIDO', bg: colors.error }
        : statusTag(st, minsToStart) ?? { label: m.category, bg: colors.accent };

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    const ok = await action.run(async () => {
      await fn();
      return true;
    });
    if (ok) {
      setPanel(null);
      after?.();
      await remote.reload();
    }
  }

  function edit() {
    loadFromMatch(m!);
    go('/schedule');
  }

  async function copy() {
    if (!m?.code) return;
    await Clipboard.setStringAsync(m.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Screen
      gap={16}
      refreshing={remote.refreshing}
      onRefresh={remote.refresh}
      overlay={
        <>
          <InviteSheet visible={panel === 'invite'} onClose={() => setPanel(null)} match={m} onChanged={remote.reload} />
          <KickSheet visible={panel === 'kick'} onClose={() => setPanel(null)} match={m} onChanged={remote.reload} />
          <CancelSheet
            visible={panel === 'cancel'}
            match={m}
            busy={action.busy}
            error={action.error}
            onClose={() => setPanel(null)}
            onConfirm={(reason) => act(() => api.cancelMatch(m.id, reason))}
          />
          <ConfirmSheet
            visible={panel === 'end'}
            tone="good"
            title="ENCERRAR PARTIDA?"
            text={`${m.name} · COMEÇOU ÀS ${formatTime(m.starts_at)}, JOGANDO HÁ ${formatDuration(now.getTime() - new Date(m.starts_at).getTime())}. A PARTIDA SAI DA HOME E VAI PARA O HISTÓRICO COMO CONCLUÍDA.`}
            cancelLabel="CONTINUAR"
            confirmLabel="ENCERRAR"
            busy={action.busy}
            error={action.error}
            onClose={() => setPanel(null)}
            onConfirm={() => act(() => api.endMatch(m.id))}
          />
          <ConfirmSheet
            visible={panel === 'leave'}
            title="SAIR DA PARTIDA?"
            text={`${m.name} · ${formatDate(m.starts_at)} ÀS ${formatTime(m.starts_at)}. SUA VAGA FICA LIVRE E ${hostMember?.nickname ?? 'O ANFITRIÃO'} SERÁ AVISADO. ${m.visibility === 'publica' ? 'PARA VOLTAR, PROCURE A PARTIDA EM PROCURAR SQUADS.' : 'PARA VOLTAR, VAI PRECISAR DO CÓDIGO OU DE UM CONVITE.'}`}
            cancelLabel="NÃO, FICAR"
            confirmLabel="SIM, SAIR"
            busy={action.busy}
            error={action.error}
            onClose={() => setPanel(null)}
            onConfirm={() => act(() => api.leaveMatch(m.id))}
          />
        </>
      }
      footer={
        <Footer
          match={m}
          active={active}
          editable={canEditOrCancel(st)}
          live={st === 'em_andamento'}
          busy={action.busy}
          onEdit={edit}
          onCancel={() => setPanel('cancel')}
          onEnd={() => setPanel('end')}
          onLeave={() => setPanel('leave')}
          onJoin={() => act(() => api.joinMatch(m.id))}
          onAcceptInvite={() => act(() => api.respondInvite(m.my_invite!, true))}
        />
      }
    >
      <View style={styles.between}>
        <TopBar />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {m.my_role === 'host' || m.my_role === 'member' || m.my_role === 'left' ? (
            <Pressable
              onPress={() => go(`/chat/match/${m.id}`)}
              accessibilityRole="button"
              accessibilityLabel={active && m.my_role !== 'left' ? 'Abrir chat do squad' : 'Ver chat do squad (só leitura)'}
              style={({ pressed }) => ({ height: 34, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 3, borderColor: colors.cyan, backgroundColor: colors.bg, boxShadow: pressed ? undefined : `3px 3px 0px ${colors.border}`, transform: pressed ? [{ translateX: 3 }, { translateY: 3 }] : [] })}
            >
              <ChatIcon size={14} />
              <T size={7} color={colors.cyan}>CHAT</T>
            </Pressable>
          ) : null}
          <Tag label={tag.label} bg={tag.bg} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <GameTile tag={m.game.tag} color={m.game.color} size={72} style={{ boxShadow: `4px 4px 0px ${colors.pink}` }} />
        <View style={{ flex: 1, gap: 10 }}>
          <T size={14} color={colors.accent}>{m.name}</T>
          <T size={7} color={colors.muted}>{`JOGO: ${m.game.name}`}</T>
          {!host ? <T size={7} color={colors.host}>{`ANFITRIÃO: ${m.host.nickname}`}</T> : null}
        </View>
      </View>

      <View style={styles.grid}>
        <Info label="DATA" value={formatDate(m.starts_at)} />
        <Info label={`HORA · ${deviceTimeZone().label}`} value={formatTime(m.starts_at)} />
        <Info label="CATEGORIA" value={m.category} />
        <Info
          label="SEU PAPEL"
          value={host ? 'ANFITRIÃO' : m.my_role === 'member' ? 'VISITANTE' : m.my_role === 'none' ? '—' : 'FORA'}
          color={host ? colors.host : colors.green}
        />
      </View>

      <Box style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
        <T size={7} color={colors.dim}>{m.platforms.length > 1 ? 'PLATAFORMAS' : 'PLATAFORMA'}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {m.platforms.map((p) => (
            <Tag key={p} label={PLATFORM_NAME[p]} bg={colors.cyan} size={8} />
          ))}
        </View>
      </Box>

      <Box style={{ backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 10 }}>
          <T size={7} color={colors.dim}>VISIBILIDADE</T>
          <T size={10} color={m.visibility === 'publica' ? colors.green : colors.accent}>{m.visibility === 'publica' ? 'PÚBLICA' : 'PRIVADA'}</T>
        </View>
        {m.code ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <T size={6} color={colors.dim}>CÓDIGO DA SALA</T>
              <T size={12} color={colors.accent} selectable>{m.code}</T>
            </View>
            <SmallButton label={copied ? 'COPIADO!' : 'COPIAR'} onPress={copy} accessibilityLabel="Copiar código da sala" />
          </View>
        ) : m.visibility === 'publica' ? (
          <T size={6} color={colors.dim} style={{ textAlign: 'right' }}>{'VISÍVEL EM\nPROCURAR SQUADS'}</T>
        ) : null}
      </Box>

      {m.description ? (
        <View style={{ gap: 10 }}>
          <T size={10}>DESCRIÇÃO</T>
          <Box dashed>
            <T size={8} color={colors.muted}>{m.description}</T>
          </Box>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionHeader
          title="SQUAD"
          right={
            member && active ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SmallButton label="+ CONVIDAR" onPress={() => setPanel('invite')} disabled={m.filled >= m.max_players} />
                {host && m.members.length > 1 ? <SmallButton label="✕ REMOVER" color={colors.error} onPress={() => setPanel('kick')} /> : null}
              </View>
            ) : undefined
          }
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 8 }}>
          <SquadSlots filled={m.filled} total={m.max_players} size={24} />
          <T size={7} color={colors.dim}>{squadText(m.filled, m.max_players)}</T>
        </View>
        {m.members.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => go(`/player/${p.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${p.nickname}`}
            style={({ pressed }) => [styles.member, pressed && { borderColor: colors.text }]}
          >
            <AvatarIcon avatar={p.avatar} size={36} border={2} />
            <T size={8} style={{ flex: 1 }}>{p.nickname}</T>
            {p.is_host ? <T size={6} color={colors.host}>ANFITRIÃO</T> : null}
            <T size={7} color={colors.cyan}>›</T>
          </Pressable>
        ))}
      </View>

      {!active || m.my_role === 'left' || m.my_role === 'kicked' ? (
        <Banner match={m} st={st} />
      ) : null}
      <ErrorText>{panel ? null : action.error}</ErrorText>
    </Screen>
  );
}

function Info({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.info}>
      <T size={7} color={colors.dim}>{label}</T>
      <T size={9} color={color}>{value}</T>
    </View>
  );
}

function Banner({ match: m, st }: { match: MatchDetail; st: string }) {
  const kind =
    m.my_role === 'kicked' ? 'kicked' : m.my_role === 'left' ? 'left' : st === 'cancelada' ? 'canceled' : 'ended';
  const cfg = {
    kicked: { title: '✕ VOCÊ FOI REMOVIDO', text: 'O ANFITRIÃO TE TIROU DO SQUAD. VOCÊ SÓ VOLTA SE FOR CONVIDADO DE NOVO.', color: colors.error },
    left: { title: 'VOCÊ SAIU DA PARTIDA', text: 'SUA VAGA FICOU LIVRE E A PARTIDA FICA NO HISTÓRICO COMO "VOCÊ SAIU".', color: colors.host },
    canceled: { title: '✕ PARTIDA CANCELADA', text: `MOTIVO: ${m.cancel_reason ?? '—'}. O SQUAD FOI AVISADO.`, color: colors.error },
    ended: {
      title: '✓ PARTIDA FINALIZADA',
      text: m.ended_at ? `DURAÇÃO: ${formatDuration(new Date(m.ended_at).getTime() - new Date(m.starts_at).getTime())}.` : 'A PARTIDA FOI PARA O HISTÓRICO.',
      color: colors.green,
    },
  }[kind];
  return (
    <Box style={{ borderColor: cfg.color, borderWidth: 4 }}>
      <T size={11} color={cfg.color}>{cfg.title}</T>
      <T size={7} color={colors.muted}>{cfg.text}</T>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.replace('/home')} accessibilityRole="link" style={{ paddingVertical: 8 }}>
          <T size={8} color={colors.cyan}>‹ HOME</T>
        </Pressable>
        <Pressable onPress={() => go('/history')} accessibilityRole="link" style={{ paddingVertical: 8 }}>
          <T size={8} color={colors.cyan}>VER HISTÓRICO ›</T>
        </Pressable>
      </View>
    </Box>
  );
}

function Footer(p: {
  match: MatchDetail;
  active: boolean;
  editable: boolean;
  live: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onEnd: () => void;
  onLeave: () => void;
  onJoin: () => void;
  onAcceptInvite: () => void;
}): ReactNode {
  const m = p.match;
  if (!p.active) return null;
  if (m.my_role === 'host') {
    if (p.editable) {
      return (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <PixelButton label="EDITAR PARTIDA" size="md" onPress={p.onEdit} style={{ flex: 1, height: 58 }} />
          <PixelButton label="CANCELAR" variant="danger" size="md" onPress={p.onCancel} style={{ width: 120, height: 58, borderColor: colors.error }} />
        </View>
      );
    }
    if (p.live) return <PixelButton label="■ ENCERRAR PARTIDA" onPress={p.onEnd} style={{ backgroundColor: colors.green }} />;
    return null;
  }
  if (m.my_role === 'member') return <PixelButton label="SAIR DA PARTIDA" variant="danger" onPress={p.onLeave} />;
  if (m.my_invite) return <PixelButton label="✓ ACEITAR CONVITE" onPress={p.onAcceptInvite} loading={p.busy} style={{ backgroundColor: colors.green }} />;
  if (m.my_role === 'none' && m.visibility === 'publica' && m.filled < m.max_players) {
    return <PixelButton label="ENTRAR NO SQUAD ›" onPress={p.onJoin} loading={p.busy} />;
  }
  return null;
}

/* ---------- Convidar ---------- */

function InviteSheet({ visible, onClose, match: m, onChanged }: { visible: boolean; onClose: () => void; match: MatchDetail; onChanged: () => void }) {
  const friends = useRemote(api.myFriends, [visible]);
  const [nick, setNick] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const free = m.max_players - m.filled;
  const inSquad = new Set(m.members.map((x) => x.id));
  const invited = new Set(m.invited);

  async function byNick() {
    setMsg(null);
    try {
      const text = await api.inviteByNick(m.id, nick);
      setMsg({ text, ok: true });
      setNick('');
      onChanged();
    } catch (e) {
      setMsg({ text: api.errorMessage(e), ok: false });
    }
  }

  async function toggle(f: FriendEntry) {
    setBusyId(f.id);
    setMsg(null);
    try {
      if (invited.has(f.id)) {
        await api.cancelInvite(m.id, f.id);
        setMsg({ text: `CONVITE PARA ${f.nickname} CANCELADO`, ok: false });
      } else {
        await api.invitePlayer(m.id, f.id);
        setMsg({ text: `CONVITE ENVIADO PARA ${f.nickname}!`, ok: true });
      }
      onChanged();
    } catch (e) {
      setMsg({ text: api.errorMessage(e), ok: false });
    } finally {
      setBusyId(null);
    }
  }

  const list = (friends.data ?? []).filter((f) => f.kind === 'friend');

  return (
    <Sheet visible={visible} onClose={onClose} title="CONVIDAR JOGADORES" subtitle={`${m.name} · ${free <= 0 ? 'SQUAD COMPLETO' : free === 1 ? '1 VAGA LIVRE' : `${free} VAGAS LIVRES`}`}>
      <Box>
        <T size={8}>CONVIDAR POR NICK</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            maxFontSizeMultiplier={FONT_SCALE_MAX}
            value={nick}
            onChangeText={(v) => setNick(v.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            placeholder="NICK DO JOGADOR"
            placeholderTextColor={colors.placeholder}
            maxLength={16}
            {...codeInput}
            accessibilityLabel="Nick do jogador"
            onSubmitEditing={byNick}
            style={styles.input}
          />
          <SmallButton label="ENVIAR" color={colors.accent} filled onPress={byNick} style={{ width: 84, height: 44 }} />
        </View>
        <Note tone={msg ? (msg.ok ? 'ok' : 'error') : 'hint'} text={msg?.text ?? 'NÃO PRECISA SER SEU AMIGO: BASTA SABER O NICK.'} />
      </Box>
      <T size={8}>AMIGOS</T>
      <LoadState loading={friends.loading} error={friends.error} />
      {friends.data && list.length === 0 ? <Empty text="VOCÊ AINDA NÃO TEM AMIGOS. ADICIONE EM AMIGOS NA HOME." /> : null}
      {list.map((f) => {
        const here = inSquad.has(f.id);
        const inv = invited.has(f.id);
        return (
          <View key={f.id} style={styles.member}>
            <AvatarIcon avatar={f.avatar} size={36} border={2} />
            <View style={{ flex: 1, gap: 6 }}>
              <T size={8}>{f.nickname}</T>
              <T size={6} color={f.online ? colors.green : colors.dim}>{f.online ? '● ONLINE' : 'OFFLINE'}</T>
            </View>
            <SmallButton
              label={here ? 'NO SQUAD' : inv ? 'CONVIDADO ✓' : 'CONVIDAR'}
              color={inv ? colors.green : colors.accent}
              filled={!here}
              disabled={here || busyId === f.id}
              onPress={() => toggle(f)}
            />
          </View>
        );
      })}
      {m.code ? <Note text={`PARTIDA PRIVADA: CONVIDADOS ENTRAM SEM PRECISAR DO CÓDIGO ${m.code}`} /> : null}
    </Sheet>
  );
}

/* ---------- Remover jogadores ---------- */

function KickSheet({ visible, onClose, match: m, onChanged }: { visible: boolean; onClose: () => void; match: MatchDetail; onChanged: () => void }) {
  const [target, setTarget] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const { busy, run } = useAction();
  const t = m.members.find((x) => x.id === target);

  async function confirm() {
    if (!t) return;
    const ok = await run(async () => {
      await api.kickPlayer(m.id, t.id);
      return true;
    });
    if (ok) {
      setMsg({ text: `${t.nickname} FOI REMOVIDO DO SQUAD. A VAGA ESTÁ LIVRE.`, ok: true });
      setTarget(null);
      onChanged();
    } else setMsg({ text: 'NÃO FOI POSSÍVEL REMOVER. TENTE DE NOVO.', ok: false });
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="REMOVER JOGADORES" subtitle={`${m.name} · ${squadText(m.filled, m.max_players)}`} accent={colors.error}>
      <Note tone={msg ? (msg.ok ? 'ok' : 'error') : 'hint'} text={msg?.text ?? 'SÓ O ANFITRIÃO PODE REMOVER. O JOGADOR REMOVIDO É AVISADO.'} />
      {m.members.map((p) => {
        const sel = target === p.id;
        return (
          <View key={p.id} style={[styles.member, sel && { borderColor: colors.error, backgroundColor: '#2A1420' }]}>
            <AvatarIcon avatar={p.avatar} size={36} border={2} />
            <View style={{ flex: 1, gap: 6 }}>
              <T size={8}>{p.is_host ? `${p.nickname} (VOCÊ)` : p.nickname}</T>
              <T size={6} color={p.is_host ? colors.host : colors.green}>{p.is_host ? 'ANFITRIÃO · NÃO PODE SER REMOVIDO' : 'NO SQUAD'}</T>
            </View>
            {!p.is_host ? (
              <SmallButton label={sel ? 'SELECIONADO' : 'REMOVER'} color={colors.error} filled={sel} onPress={() => { setTarget(p.id); setMsg(null); }} />
            ) : null}
          </View>
        );
      })}
      {t ? (
        <Box style={{ borderColor: colors.error, backgroundColor: '#2A1420' }}>
          <T size={9} color={colors.error}>{`REMOVER ${t.nickname} DO SQUAD?`}</T>
          <T size={6} color={colors.muted}>
            {`A VAGA FICA LIVRE E ${t.nickname} SERÁ AVISADO. ELE NÃO CONSEGUE ENTRAR DE NOVO NESTA PARTIDA PELO CÓDIGO NEM POR PROCURAR SQUADS, SÓ SE VOCÊ CONVIDAR.`}
          </T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PixelButton label="NÃO" variant="secondary" size="md" shadow={false} onPress={() => setTarget(null)} style={{ flex: 1 }} />
            <PixelButton label="SIM, REMOVER" size="md" loading={busy} onPress={confirm} style={{ flex: 1, backgroundColor: colors.error }} />
          </View>
        </Box>
      ) : null}
    </Sheet>
  );
}

/* ---------- Cancelar ---------- */

function CancelSheet({
  visible,
  match: m,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  match: MatchDetail;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (r: CancelReason) => void;
}) {
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [tried, setTried] = useState(false);
  const others = Math.max(0, m.filled - 1);
  return (
    <ConfirmSheet
      visible={visible}
      title="CANCELAR PARTIDA?"
      text={`${m.name} · ${formatDate(m.starts_at)} ÀS ${formatTime(m.starts_at)}. ${others === 0 ? 'NINGUÉM ENTROU NO SQUAD AINDA.' : others === 1 ? '1 JOGADOR DO SQUAD SERÁ AVISADO.' : `${others} JOGADORES DO SQUAD SERÃO AVISADOS.`} A PARTIDA VAI PARA O HISTÓRICO COMO CANCELADA. ESSA AÇÃO NÃO PODE SER DESFEITA.`}
      confirmLabel="SIM, CANCELAR"
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={() => {
        setTried(true);
        if (reason) onConfirm(reason);
      }}
    >
      <T size={8}>MOTIVO</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CANCEL_REASONS.map((r) => (
          <Chip key={r} compact label={r} color={colors.error} selected={reason === r} onPress={() => setReason(r)} style={{ width: '48%' }} />
        ))}
      </View>
      <Note tone={tried && !reason ? 'error' : 'hint'} text={tried && !reason ? 'ESCOLHA UM MOTIVO PARA CANCELAR' : 'O MOTIVO APARECE PARA O SQUAD E NO HISTÓRICO.'} />
    </ConfirmSheet>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  info: { width: '48.5%', padding: 12, gap: 10, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.border },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: colors.card, borderWidth: 3, borderColor: colors.line },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingHorizontal: 10,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: font,
    fontSize: 9,
  },
});
