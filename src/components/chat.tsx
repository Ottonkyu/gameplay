import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, type ScrollViewInstance, type TextInputInstance } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import type { ChatMessage } from '../api/types';
import { AvatarIcon } from '../avatar/AvatarView';
import { errorMessage } from '../api';
import { WEEK_SHORT, pad2 } from '../lib/dates';
import { colors, font, pixelShadow, FONT_SCALE_MAX } from '../theme';
import { PixelArt } from './pixel';
import { ErrorText, T } from './ui';

/** Balão de chat em pixel art (atalho da Home, botões CHAT). */
export function ChatIcon({ size = 22, color = colors.cyan, ink = colors.bg }: { size?: number; color?: string; ink?: string }) {
  return (
    <PixelArt
      grid={10}
      size={size}
      rects={[[0, 0, 10, 6, color], [2, 6, 2, 1, color], [2, 7, 1, 1, color], [2, 2, 6, 1, ink], [2, 4, 4, 1, ink]]}
    />
  );
}

export function LockIcon({ size = 18 }: { size?: number }) {
  return (
    <PixelArt
      grid={8}
      size={size}
      rects={[[2, 0, 4, 1, colors.accent], [1, 1, 1, 3, colors.accent], [6, 1, 1, 3, colors.accent], [0, 3, 8, 5, colors.accent], [3, 5, 2, 2, colors.bg]]}
    />
  );
}

export const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const base = `${WEEK_SHORT[d.getDay()]}, ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
  if (key(d) === key(now)) return `HOJE · ${base}`;
  if (key(d) === key(yesterday)) return `ONTEM · ${base}`;
  return base;
}

/** Hora curta para a lista de conversas: 21:32, ONTEM ou SEG. */
export function shortWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return timeOf(iso);
  if (days === 1) return 'ONTEM';
  if (days < 7) return WEEK_SHORT[d.getDay()];
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** Aviso do sistema no meio da conversa (partida começou, chat encerrado...). */
export type ChatMarker = { at: string; text: string; color?: string };

type Row =
  | { type: 'day'; key: string; text: string }
  | { type: 'sys'; key: string; text: string; color: string }
  | { type: 'msg'; key: string; m: ChatMessage; showNick: boolean };

function buildRows(messages: ChatMessage[], markers: ChatMarker[]): Row[] {
  const items = [
    ...messages.map((m) => ({ at: m.created_at, kind: 'msg' as const, m })),
    ...markers.map((s) => ({ at: s.at, kind: 'sys' as const, s })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const rows: Row[] = [];
  let day = '';
  let prev = '';
  items.forEach((it, i) => {
    const d = dayLabel(it.at);
    if (d !== day) {
      rows.push({ type: 'day', key: `d${i}`, text: d });
      day = d;
      prev = '';
    }
    if (it.kind === 'sys') {
      rows.push({ type: 'sys', key: `s${i}`, text: it.s.text, color: it.s.color ?? colors.dim });
      prev = '';
    } else {
      rows.push({ type: 'msg', key: `m${it.m.id}`, m: it.m, showNick: prev !== it.m.sender.id });
      prev = it.m.sender.id;
    }
  });
  return rows;
}

export function MessageList({
  messages,
  markers = [],
  hostId,
  showNicks = true,
  empty,
}: {
  messages: ChatMessage[];
  markers?: ChatMarker[];
  hostId?: string;
  showNicks?: boolean;
  empty?: string;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const rows = buildRows(messages, markers);
  // Sempre mostra a mensagem mais nova.
  // Também ao abrir o teclado: a área da conversa encolhe e a última mensagem não pode sumir.
  const keyboardOpen = useKeyboardState((k) => k.isVisible);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [messages.length, markers.length, keyboardOpen]);

  return (
    <ScrollView
      ref={ref}
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 10, paddingVertical: 4, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Mensagens"
    >
      {rows.length === 0 && empty ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <T size={7} color={colors.dim} style={{ textAlign: 'center' }}>{empty}</T>
        </View>
      ) : null}
      {rows.map((r) => {
        if (r.type === 'day') {
          return (
            <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, height: 2, backgroundColor: colors.line }} />
              <T size={6} color={colors.placeholder}>{r.text}</T>
              <View style={{ flex: 1, height: 2, backgroundColor: colors.line }} />
            </View>
          );
        }
        if (r.type === 'sys') {
          return (
            <View key={r.key} style={{ alignSelf: 'center', maxWidth: '90%', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: colors.card, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line }}>
              <T size={6} color={r.color} style={{ textAlign: 'center' }}>{r.text}</T>
            </View>
          );
        }
        const m = r.m;
        if (m.mine) {
          return (
            <View key={r.key} style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: 10, gap: 6, backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.text, boxShadow: pixelShadow(colors.pink, 3) }}>
              <T size={8} color={colors.bg} selectable>{m.body}</T>
              <T size={5} color={colors.disabled} style={{ alignSelf: 'flex-end' }}>{timeOf(m.created_at)}</T>
            </View>
          );
        }
        return (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '86%' }}>
            <View style={{ width: 26 }}>{r.showNick ? <AvatarIcon avatar={m.sender.avatar} size={26} border={2} /> : null}</View>
            <View style={{ gap: 6, flexShrink: 1 }}>
              {showNicks && r.showNick ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T size={6} color={nickColor(m.sender.nickname)}>{m.sender.nickname}</T>
                  {m.sender.id === hostId ? (
                    <View style={{ paddingHorizontal: 4, paddingVertical: 2, backgroundColor: colors.host }}>
                      <T size={5} color={colors.bg}>ANFITRIÃO</T>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View style={{ padding: 10, gap: 6, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.border }}>
                <T size={8} selectable>{m.body}</T>
                <T size={5} color={colors.dim} style={{ alignSelf: 'flex-end' }}>{timeOf(m.created_at)}</T>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const NICK_COLORS = [colors.cyan, colors.green, '#FF8A3D', '#B18CFF', '#FFB3D1', '#FF6B6B'];
const nickColor = (n: string) => NICK_COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % NICK_COLORS.length];

/** Campo de mensagem + atalhos. `onSend` deve lançar erro com mensagem pronta. */
export function Composer({
  onSend,
  placeholder,
  quick = [],
}: {
  onSend: (text: string) => Promise<void>;
  placeholder: string;
  quick?: [string, string][];
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInputInstance>(null);

  // Atalho que termina com espaço só preenche o campo (ex.: "MEU NICK NO JOGO É ").
  function pickQuick(msg: string) {
    if (msg.endsWith(' ')) {
      setText(msg);
      input.current?.focus();
    } else send(msg);
  }

  async function send(value: string) {
    const v = value.trim();
    if (!v || busy || sending.current) return;
    sending.current = true; // toque duplo não manda a mensagem 2x
    setBusy(true);
    setError(null);
    try {
      await onSend(v);
      setText('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      {quick.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
          {quick.map(([label, msg]) => (
            <Pressable
              key={label}
              onPress={() => pickQuick(msg)}
              accessibilityRole="button"
              accessibilityLabel={msg.endsWith(' ') ? `Escrever: ${msg.trim()}` : `Mandar: ${msg}`}
              style={({ pressed }) => ({ height: 32, paddingHorizontal: 8, justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: pressed ? colors.text : colors.border })}
            >
              <T size={6} color={colors.cyan}>{label}</T>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          maxFontSizeMultiplier={FONT_SCALE_MAX}
          ref={input}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.accent}
          maxLength={300}
          multiline
          accessibilityLabel="Mensagem"
          onSubmitEditing={() => send(text)}
          submitBehavior="submit"
          returnKeyType="send"
          style={{ flex: 1, minWidth: 0, minHeight: 46, maxHeight: 110, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.border, color: colors.text, fontFamily: font, fontSize: 9, lineHeight: 15 }}
        />
        <Pressable
          onPress={() => send(text)}
          disabled={busy || !text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Enviar mensagem"
          style={({ pressed }) => ({
            width: 70,
            height: 46,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
            borderWidth: 3,
            borderColor: colors.text,
            opacity: busy || !text.trim() ? 0.5 : 1,
            boxShadow: pressed ? undefined : pixelShadow(colors.pink, 3),
            transform: pressed ? [{ translateX: 3 }, { translateY: 3 }] : [],
          })}
        >
          <T size={8} color={colors.bg}>{busy ? '...' : 'ENVIAR'}</T>
        </Pressable>
      </View>
    </View>
  );
}

/** Faixa no lugar do campo quando o chat está encerrado. */
export function ClosedBar({ title, text }: { title: string; text: string }) {
  return (
    <View accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.card, borderWidth: 3, borderStyle: 'dashed', borderColor: colors.border }}>
      <LockIcon />
      <View style={{ flex: 1, gap: 6 }}>
        <T size={8} color={colors.accent}>{title}</T>
        <T size={6} color={colors.muted}>{text}</T>
      </View>
    </View>
  );
}
