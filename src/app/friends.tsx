import { go } from '../lib/nav';
import { ChatIcon } from '../components/chat';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import * as api from '../api';
import type { FriendEntry } from '../api/types';
import { AvatarIcon } from '../avatar/AvatarView';
import { Empty, LoadState, Note, Screen, SmallButton, T, Title, TopBar, codeInput } from '../components/ui';
import { useRemote } from '../lib/hooks';
import { colors, font, nickSize, FONT_SCALE_MAX } from '../theme';

type Tab = 'friend' | 'received' | 'sent';
const TABS: [Tab, string][] = [['friend', 'AMIGOS'], ['received', 'PEDIDOS'], ['sent', 'ENVIADOS']];

export default function Friends() {
  const narrow = useWindowDimensions().width < 360; // 320px: o card inteiro já abre o perfil
  const remote = useRemote(api.myFriends, [], { live: true });
  const [tab, setTab] = useState<Tab>('friend');
  const [nick, setNick] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const all = remote.data ?? [];
  const list = all.filter((f) => f.kind === tab);
  const count = (k: Tab) => all.filter((f) => f.kind === k).length;

  async function send() {
    setMsg(null);
    setBusy('send');
    try {
      const text = await api.sendFriendRequest(nick);
      setMsg({ text, ok: true });
      setNick('');
      setTab('sent');
      await remote.reload();
    } catch (e) {
      const text = api.errorMessage(e);
      setMsg({ text, ok: false });
      if (text.includes('ACEITE EM PEDIDOS')) setTab('received');
    } finally {
      setBusy(null);
    }
  }

  async function act(f: FriendEntry, fn: () => Promise<unknown>, text: string, ok: boolean) {
    setBusy(f.id);
    try {
      await fn();
      setMsg({ text, ok });
      await remote.reload();
    } catch (e) {
      setMsg({ text: api.errorMessage(e), ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen gap={16} refreshing={remote.refreshing} onRefresh={remote.refresh}>
      <TopBar right={`${count('friend')} ${count('friend') === 1 ? 'AMIGO' : 'AMIGOS'}`} />
      <Title>AMIGOS</Title>

      <View style={{ gap: 8 }}>
        <T size={9}>ADICIONAR POR NICK</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            maxFontSizeMultiplier={FONT_SCALE_MAX}
            value={nick}
            onChangeText={(v) => {
              setNick(v.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
              setMsg(null);
            }}
            placeholder="NICK DO JOGADOR"
            placeholderTextColor={colors.placeholder}
            {...codeInput}
            maxLength={16}
            accessibilityLabel="Nick do jogador"
            onSubmitEditing={send}
            style={[styles.input, msg && !msg.ok ? { borderColor: colors.error } : null]}
          />
          <SmallButton label="ENVIAR" color={colors.accent} filled disabled={busy === 'send'} onPress={send} style={{ width: 80, height: 46 }} />
        </View>
        <Note tone={msg ? (msg.ok ? 'ok' : 'error') : 'hint'} text={msg?.text ?? 'O PEDIDO SÓ VIRA AMIZADE QUANDO O OUTRO JOGADOR ACEITAR.'} />
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {TABS.map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, { backgroundColor: on ? colors.accent : colors.bg, borderColor: on ? colors.text : colors.border }]}
            >
              <T size={7} color={on ? colors.bg : colors.muted}>{`${label} (${count(k)})`}</T>
            </Pressable>
          );
        })}
      </View>

      <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      {remote.data && list.length === 0 ? (
        <Empty
          text={
            tab === 'friend'
              ? 'VOCÊ AINDA NÃO TEM AMIGOS. ADICIONE PELO NICK ACIMA.'
              : tab === 'received'
                ? 'NENHUM PEDIDO RECEBIDO.'
                : 'NENHUM PEDIDO PENDENTE.'
          }
        />
      ) : null}

      {list.map((f) => (
        <View key={f.id} style={styles.row}>
          <Pressable onPress={() => go(`/player/${f.id}`)} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${f.nickname}`}>
            <AvatarIcon avatar={f.avatar} size={48} />
          </Pressable>
          <Pressable onPress={() => go(`/player/${f.id}`)} style={{ flex: 1, gap: 8, minWidth: 0 }} accessibilityRole="button">
            <T size={nickSize(f.nickname, 9)} numberOfLines={1}>{f.nickname}</T>
            {narrow ? null : <T size={6} color={colors.cyan} numberOfLines={1}>VER PERFIL ›</T>}
            <T size={6} color={tab === 'friend' ? (f.online ? colors.green : colors.dim) : tab === 'received' ? colors.accent : colors.dim}>
              {tab === 'friend' ? (f.online ? '● ONLINE' : 'OFFLINE') : tab === 'received' ? 'QUER SER SEU AMIGO' : 'AGUARDANDO RESPOSTA'}
            </T>
          </Pressable>
          {tab === 'friend' ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                onPress={() => go(`/chat/friend/${f.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Conversar com ${f.nickname}`}
                style={({ pressed }) => ({ width: 38, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: pressed ? colors.text : colors.border })}
              >
                <ChatIcon size={16} />
              </Pressable>
              <SmallButton label="CONVIDAR" onPress={() => go(`/invite/${f.id}`)} accessibilityLabel={`Convidar ${f.nickname} para uma partida`} />
            </View>
          ) : tab === 'received' ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <SmallButton
                label="✓"
                color={colors.green}
                filled
                disabled={busy === f.id}
                accessibilityLabel={`Aceitar pedido de ${f.nickname}`}
                onPress={() => act(f, () => api.respondFriendRequest(f.id, true), `${f.nickname} AGORA É SEU AMIGO!`, true)}
                style={{ width: 40 }}
              />
              <SmallButton
                label="✕"
                color={colors.host}
                disabled={busy === f.id}
                accessibilityLabel={`Recusar pedido de ${f.nickname}`}
                onPress={() => act(f, () => api.respondFriendRequest(f.id, false), `PEDIDO DE ${f.nickname} RECUSADO`, false)}
                style={{ width: 40 }}
              />
            </View>
          ) : (
            <SmallButton
              label="CANCELAR"
              color={colors.host}
              disabled={busy === f.id}
              onPress={() => act(f, () => api.removeFriend(f.id), `PEDIDO PARA ${f.nickname} CANCELADO`, false)}
            />
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    minWidth: 0,
    height: 46,
    paddingHorizontal: 12,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: font,
    fontSize: 10,
  },
  tab: { flex: 1, height: 40, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: colors.card, borderWidth: 3, borderColor: colors.line },
});
