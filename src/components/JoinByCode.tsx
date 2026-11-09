import { go } from '../lib/nav';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { errorMessage, joinByCode, previewCode } from '../api';
import type { CodePreview } from '../api/types';
import { formatWhen } from '../lib/dates';
import { colors, font, FONT_SCALE_MAX } from '../theme';
import { GameTile } from './pixel';
import { Box, ErrorText, Note, PixelButton, Sheet, T, codeInput } from './ui';

type Step = 'input' | 'preview' | 'done';

/** Entrar por código: digitar → ver a sala → confirmar. */
export function JoinByCode({ visible, onClose, onJoined }: { visible: boolean; onClose: () => void; onJoined: () => void }) {
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [room, setRoom] = useState<CodePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    onClose();
    setTimeout(() => {
      setStep('input');
      setCode('');
      setRoom(null);
      setError(null);
    }, 300);
  }

  function onChange(v: string) {
    let x = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (x.startsWith('GP')) x = x.slice(2);
    x = x.slice(0, 4);
    setCode(x ? `GP-${x}` : '');
    setError(null);
  }

  async function search() {
    if (!/^GP-[A-Z0-9]{4}$/.test(code)) {
      setError('CÓDIGO INVÁLIDO. O FORMATO É GP-XXXX');
      return;
    }
    setBusy(true);
    try {
      setRoom(await previewCode(code));
      setStep('preview');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await joinByCode(room.code);
      setStep('done');
      onJoined();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const full = room ? room.filled >= room.max_players : false;
  const title = step === 'done' ? 'TUDO CERTO!' : step === 'preview' ? 'CONFIRMAR ENTRADA' : 'ENTRAR POR CÓDIGO';

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {step === 'input' ? (
        <>
          <T size={7} color={colors.muted}>DIGITE O CÓDIGO DA SALA PRIVADA QUE O ANFITRIÃO COMPARTILHOU COM VOCÊ.</T>
          <TextInput
            maxFontSizeMultiplier={FONT_SCALE_MAX}
            value={code}
            onChangeText={onChange}
            placeholder="GP-XXXX"
            placeholderTextColor={colors.placeholder}
            {...codeInput}
            maxLength={7}
            accessibilityLabel="Código da sala"
            onSubmitEditing={search}
            style={{
              height: 54,
              borderWidth: 3,
              borderColor: error ? colors.error : colors.border,
              backgroundColor: colors.surface,
              color: colors.accent,
              fontFamily: font,
              fontSize: 16,
              letterSpacing: 2,
              textAlign: 'center',
            }}
          />
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PixelButton label="CANCELAR" variant="secondary" size="md" shadow={false} onPress={close} style={{ flex: 1 }} />
            <PixelButton label="BUSCAR" size="md" onPress={search} loading={busy} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}

      {step === 'preview' && room ? (
        <>
          <Note tone="ok" text={`✓ SALA ${room.code} ENCONTRADA`} />
          <Box style={{ borderColor: colors.accent }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <GameTile tag={room.game.tag} color={room.game.color} size={40} />
              <View style={{ flex: 1, gap: 6 }}>
                <T size={9}>{room.name}</T>
                <T size={6} color={colors.dim}>{`${room.game.name} · ${room.category}`}</T>
              </View>
            </View>
            <T size={7} color={colors.accent}>{formatWhen(room.starts_at)}</T>
            <T size={6} color={colors.host}>{`ANFITRIÃO: ${room.host}`}</T>
            <T size={6} color={colors.dim}>{`${room.filled}/${room.max_players} NO SQUAD${full ? ' · LOTADA' : ''}`}</T>
          </Box>
          <Note
            tone={room.already_member ? 'hint' : full || room.kicked ? 'error' : 'hint'}
            text={
              room.already_member
                ? 'VOCÊ JÁ ESTÁ NESSA PARTIDA. ELA ESTÁ NA SUA HOME.'
                : room.kicked
                  ? 'O ANFITRIÃO TE REMOVEU DESSA PARTIDA. SÓ DÁ PARA VOLTAR COM UM CONVITE DELE.'
                  : full
                    ? 'ESSA SALA ESTÁ LOTADA. PEÇA AO ANFITRIÃO PARA ABRIR UMA VAGA.'
                    : 'CONFIRME PARA ENTRAR NO SQUAD.'
            }
          />
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PixelButton label="‹ OUTRO CÓDIGO" variant="secondary" size="md" shadow={false} onPress={() => setStep('input')} style={{ flex: 1 }} />
            <PixelButton
              label={room.already_member ? 'JÁ ESTÁ' : full ? 'LOTADA' : 'ENTRAR ›'}
              size="md"
              onPress={join}
              loading={busy}
              disabled={room.already_member || full || room.kicked}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : null}

      {step === 'done' && room ? (
        <>
          <Box style={{ borderColor: colors.green, backgroundColor: '#1B2A2A' }}>
            <T size={10} color={colors.green}>✓ VOCÊ ENTROU NO SQUAD!</T>
            <T size={7} color={colors.muted}>{`${room.name} JÁ APARECE NAS SUAS PARTIDAS MARCADAS.`}</T>
          </Box>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PixelButton label="FECHAR" variant="secondary" size="md" shadow={false} onPress={close} style={{ flex: 1 }} />
            <PixelButton
              label="VER PARTIDA ›"
              size="md"
              onPress={() => {
                close();
                go(`/match/${room.match_id}`);
              }}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}
