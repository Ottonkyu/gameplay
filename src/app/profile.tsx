import { useLocalSearchParams } from 'expo-router';
import { go } from '../lib/nav';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import * as api from '../api';
import type { ProfileVisibility } from '../api/types';
import { AvatarStage } from '../avatar/AvatarView';
import { DEFAULT_AVATAR } from '../avatar/avatar';
import { GameTile } from '../components/pixel';
import { Box, Chip, ConfirmSheet, ErrorText, LoadState, Note, PixelButton, Screen, SectionHeader, SmallButton, T, TopBar, capsInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useAction, useRemote } from '../lib/hooks';
import { DEFAULT_SOUND, previewSound, SOUNDS } from '../lib/sounds';
import { openSystemSettings, pushPermission, registerForPush, type PushStatus } from '../lib/push';
import type { NotifPrefs } from '../api/types';
import { BIO_MAX, colors, font, GENRES, FONT_SCALE_MAX } from '../theme';

const NOTIF_GROUPS: [Exclude<keyof NotifPrefs, 'som'>, string, string][] = [
  ['partidas', 'PARTIDAS', 'CONVITES, COMEÇA EM BREVE, COMEÇOU, MUDANÇA DE HORÁRIO, CANCELAMENTO E REMOÇÃO.'],
  ['squad', 'SQUAD', 'QUEM ENTROU OU SAIU, SQUAD COMPLETO E RESPOSTA DOS SEUS CONVITES.'],
  ['amigos', 'AMIGOS', 'PEDIDOS DE AMIZADE E PEDIDOS ACEITOS.'],
  ['mensagens', 'MENSAGENS', 'CHAT DO SQUAD E CONVERSAS COM AMIGOS. NÃO ENTRAM NO SININHO.'],
  ['amigos_partidas', 'PARTIDAS DE AMIGOS', 'QUANDO UM AMIGO CRIA UMA PARTIDA PÚBLICA.'],
];
const DEFAULT_PREFS: NotifPrefs = { partidas: true, squad: true, amigos: true, amigos_partidas: false, mensagens: true, som: DEFAULT_SOUND };

const VIS: [ProfileVisibility, string, string, string][] = [
  ['publica', 'PÚBLICO', colors.green, 'QUALQUER JOGADOR VÊ SEU SOBRE, ESTILOS E JOGOS PREFERIDOS.'],
  ['amigos', 'SÓ AMIGOS', colors.accent, 'SÓ SEUS AMIGOS VEEM SEU SOBRE, ESTILOS E JOGOS. OS OUTROS VEEM SÓ SEU AVATAR E NICK.'],
  ['privada', 'PRIVADO', colors.error, 'NINGUÉM VÊ SEU SOBRE, ESTILOS E JOGOS, NEM SEUS AMIGOS. VOCÊ CONTINUA RECEBENDO PEDIDOS E CONVITES.'],
];

export default function Profile() {
  const { profile, saveProfile, signOut } = useAuth();
  const games = useRemote(api.listGames, []);
  const save = useAction();
  const [editBio, setEditBio] = useState(false);
  const [bio, setBio] = useState('');
  const [bioSaved, setBioSaved] = useState(false);
  const [editGenres, setEditGenres] = useState(false);
  const [editGames, setEditGames] = useState(false);
  const [logout, setLogout] = useState(false);
  const [push, setPush] = useState<PushStatus | null>(null);

  useEffect(() => {
    pushPermission().then(setPush);
  }, []);

  // Vindo do AJUSTES da central de avisos: rola até NOTIFICAÇÕES e pisca a borda.
  const { secao } = useLocalSearchParams<{ secao?: string }>();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [notifY, setNotifY] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const jumped = useRef(false);
  useEffect(() => {
    if (secao !== 'notificacoes' || notifY === null || jumped.current) return;
    jumped.current = true;
    const t1 = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, notifY - 12), animated: true });
      setFlash(true);
    }, 150);
    const t2 = setTimeout(() => setFlash(false), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [secao, notifY]);

  if (!profile) {
    return (
      <Screen>
        <TopBar />
        <LoadState loading />
      </Screen>
    );
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const vis = VIS.find((v) => v[0] === profile.visibility) ?? VIS[1];
  const genreList = editGenres ? [...GENRES] : profile.genres;
  const gameList = (games.data ?? []).filter((g) => editGames || profile.fav_games.includes(g.name));

  return (
    <Screen
      gap={18}
      scrollRef={scrollRef}
      overlay={
        <ConfirmSheet
          visible={logout}
          title="SAIR DA CONTA?"
          text="VOCÊ VAI PRECISAR ENTRAR DE NOVO COM SEU E-MAIL E SENHA."
          confirmLabel="SAIR"
          onClose={() => setLogout(false)}
          onConfirm={async () => {
            setLogout(false);
            await signOut();
          }}
        />
      }
    >
      <TopBar right="PERFIL" />
      <View style={{ alignItems: 'center' }}>
        <AvatarStage avatar={profile.avatar ?? DEFAULT_AVATAR} width={184} label="Seu avatar de corpo inteiro" />
      </View>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <T size={18} color={colors.accent} style={{ textShadowColor: colors.pink, textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 }}>
          {profile.nickname}
        </T>
        <PixelButton label="EDITAR AVATAR ›" variant="secondary" size="md" onPress={() => go('/avatar-editor')} style={{ alignSelf: 'stretch' }} />
        <Pressable onPress={() => go('/history')} accessibilityRole="button" style={({ pressed }) => [styles.link, pressed && { borderColor: colors.text }]}>
          <T size={9}>HISTÓRICO DE PARTIDAS</T>
          <T color={colors.accent}>›</T>
        </Pressable>
      </View>

      {/* SOBRE */}
      <View style={{ gap: 10 }}>
        <SectionHeader
          title="SOBRE"
          right={
            editBio ? (
              <T size={7} color={bio.length >= BIO_MAX - 10 ? colors.error : colors.dim}>{`${bio.length}/${BIO_MAX}`}</T>
            ) : (
              <SmallButton
                label="EDITAR"
                onPress={() => {
                  setBio(profile.bio);
                  setEditBio(true);
                  setBioSaved(false);
                }}
              />
            )
          }
        />
        {editBio ? (
          <>
            <TextInput
              maxFontSizeMultiplier={FONT_SCALE_MAX}
              value={bio}
              onChangeText={setBio}
              maxLength={BIO_MAX}
              {...capsInput}
              multiline
              placeholder="EX: JOGO À NOITE, CURTO FPS E SEMPRE ENTRO NA CALL."
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Sobre você"
              style={styles.bio}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PixelButton label="CANCELAR" variant="secondary" size="md" shadow={false} onPress={() => setEditBio(false)} style={{ flex: 1 }} />
              <PixelButton
                label="SALVAR"
                size="md"
                loading={save.busy}
                onPress={async () => {
                  const ok = await save.run(async () => {
                    await saveProfile({ bio: api.caps(bio) });
                    return true;
                  });
                  if (ok) {
                    setEditBio(false);
                    setBioSaved(true);
                  }
                }}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <Box dashed>
            <T size={8} color={profile.bio ? colors.muted : colors.dim}>
              {profile.bio || 'VOCÊ AINDA NÃO ESCREVEU NADA. TOQUE EM EDITAR E CONTE COMO VOCÊ JOGA.'}
            </T>
          </Box>
        )}
        {bioSaved ? <Note tone="ok" text="✓ SOBRE ATUALIZADO" /> : null}
      </View>

      {/* VISIBILIDADE */}
      <View style={{ gap: 10 }}>
        <T size={10}>VISIBILIDADE DO PERFIL</T>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {VIS.map(([id, label, color]) => (
            <Chip key={id} compact label={label} color={color} selected={profile.visibility === id} onPress={() => save.run(() => saveProfile({ visibility: id }))} style={{ flex: 1, paddingHorizontal: 2 }} />
          ))}
        </View>
        <Box style={{ borderColor: vis[2] }}>
          <T size={7} color={colors.muted}>{vis[3]}</T>
        </Box>
      </View>

      {/* NOTIFICAÇÕES */}
      <View
        onLayout={(e) => setNotifY(e.nativeEvent.layout.y)}
        style={[{ gap: 10 }, flash && { padding: 5, margin: -8, borderWidth: 3, borderColor: colors.accent }]}
      >
        <T size={10}>NOTIFICAÇÕES</T>
        {NOTIF_GROUPS.map(([key, label, hint]) => {
          const prefs = { ...DEFAULT_PREFS, ...(profile.notif_prefs ?? {}) };
          const on = prefs[key] !== false;
          return (
            <Pressable
              key={key}
              onPress={() => save.run(() => saveProfile({ notif_prefs: { ...prefs, [key]: !on } }))}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Notificações de ${label.toLowerCase()}`}
              style={({ pressed }) => [styles.toggleRow, pressed && { borderColor: colors.text }]}
            >
              <View style={{ flex: 1, gap: 7 }}>
                <T size={8}>{label}</T>
                <T size={6} color={colors.dim}>{hint}</T>
              </View>
              <View style={[styles.switch, { backgroundColor: on ? colors.green : colors.bg, borderColor: on ? colors.text : colors.border }]}>
                <View style={[styles.knob, { alignSelf: on ? 'flex-end' : 'flex-start', backgroundColor: on ? colors.bg : colors.border }]} />
              </View>
            </Pressable>
          );
        })}
        <View style={{ gap: 8, marginTop: 6 }}>
          <T size={8}>SOM DAS NOTIFICAÇÕES</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SOUNDS.map((s) => {
              const prefs = { ...DEFAULT_PREFS, ...(profile.notif_prefs ?? {}) };
              const on = (prefs.som ?? DEFAULT_SOUND) === s.id;
              return (
                <Chip
                  key={s.id}
                  label={s.label}
                  selected={on}
                  onPress={() => {
                    previewSound(s.id);
                    if (!on) save.run(() => saveProfile({ notif_prefs: { ...prefs, som: s.id } }));
                  }}
                />
              );
            })}
          </View>
          <T size={6} color={colors.dim}>TOQUE PARA OUVIR. VALE PARA OS AVISOS QUE CHEGAM NO CELULAR (APK).</T>
        </View>
        {push === 'denied' || push === 'undetermined' ? (
          <Box style={{ borderColor: colors.accent }}>
            <T size={7} color={colors.accent}>
              {push === 'denied' ? 'AS NOTIFICAÇÕES ESTÃO BLOQUEADAS NOS AJUSTES DO CELULAR.' : 'O CELULAR AINDA NÃO DEU PERMISSÃO PARA NOTIFICAR.'}
            </T>
            <T size={6} color={colors.muted}>VOCÊ CONTINUA VENDO TUDO NO SININHO DA HOME.</T>
            <SmallButton
              label={push === 'denied' ? 'ABRIR AJUSTES DO CELULAR ›' : 'PERMITIR NOTIFICAÇÕES'}
              color={colors.accent}
              onPress={async () => (push === 'denied' ? openSystemSettings() : setPush(await registerForPush()))}
            />
          </Box>
        ) : push === 'unsupported' ? (
          <Note text="ESTE APARELHO NÃO RECEBE PUSH (EX.: NAVEGADOR OU EXPO GO NO ANDROID). OS AVISOS APARECEM NO SININHO DA HOME." />
        ) : null}
      </View>

      {/* ESTILOS */}
      <View style={{ gap: 10 }}>
        <SectionHeader title="ESTILOS PREFERIDOS" right={<SmallButton label={editGenres ? 'PRONTO' : 'EDITAR'} onPress={() => setEditGenres((v) => !v)} />} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {genreList.map((g) => (
            <Chip
              key={g}
              compact
              label={g}
              selected={profile.genres.includes(g)}
              onPress={() => editGenres && save.run(() => saveProfile({ genres: toggle(profile.genres, g) }))}
            />
          ))}
          {!editGenres && profile.genres.length === 0 ? <T size={8} color={colors.dim}>NENHUM ESTILO ESCOLHIDO</T> : null}
        </View>
      </View>

      {/* JOGOS */}
      <View style={{ gap: 10 }}>
        <SectionHeader title="JOGOS PREFERIDOS" right={<SmallButton label={editGames ? 'PRONTO' : 'EDITAR'} onPress={() => setEditGames((v) => !v)} />} />
        <LoadState loading={games.loading} error={games.error} />
        <View style={styles.games}>
          {gameList.map((g) => {
            const on = profile.fav_games.includes(g.name);
            return (
              <Pressable
                key={g.id}
                disabled={!editGames}
                onPress={() => save.run(() => saveProfile({ fav_games: toggle(profile.fav_games, g.name) }))}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={g.name}
                style={[styles.game, { borderColor: on ? colors.accent : colors.border, borderStyle: on ? 'solid' : 'dashed', opacity: on ? 1 : 0.6, backgroundColor: on ? colors.surface : colors.bg }]}
              >
                <GameTile tag={g.tag} color={g.color} size={36} />
                <T size={6} style={{ textAlign: 'center' }} numberOfLines={2}>{g.name}</T>
              </Pressable>
            );
          })}
        </View>
        <Note text={editGames ? 'TOQUE PARA MARCAR OU DESMARCAR. SALVA NA HORA.' : `${profile.fav_games.length} JOGOS NO PERFIL`} />
      </View>

      <ErrorText>{save.error}</ErrorText>
      <Pressable onPress={() => setLogout(true)} accessibilityRole="button" style={{ alignSelf: 'center', padding: 12 }}>
        <T size={9} color={colors.host}>SAIR DA CONTA</T>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'stretch',
    height: 46,
    paddingHorizontal: 14,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bio: {
    minHeight: 86,
    padding: 12,
    borderWidth: 3,
    borderColor: colors.text,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: font,
    fontSize: 8,
    lineHeight: 16,
    textAlignVertical: 'top',
  },
  games: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: 3, borderColor: colors.line, backgroundColor: colors.card },
  switch: { width: 52, height: 28, borderWidth: 3, padding: 2, justifyContent: 'center' },
  knob: { width: 18, height: 18 },
  game: { width: '31.5%', height: 88, borderWidth: 3, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 4 },
});
