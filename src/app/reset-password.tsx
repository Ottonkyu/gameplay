import { Redirect, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { errorMessage } from '../api';
import { Cursor, PixelArt } from '../components/pixel';
import { LoadState, PixelButton, PixelInput, Screen, T, Title, TopBar } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, pixelShadow } from '../theme';

const MIN = 8;

/** Tela aberta pelo link do e-mail de "esqueci a senha". */
export default function ResetPassword() {
  const { recovery, session, updatePassword, endRecovery, signOut } = useAuth();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [error, setError] = useState<{ field: 1 | 2; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Screen gap={28} footer={<PixelButton label="JOGAR ›" onPress={() => { endRecovery(); router.replace('/home'); }} />}>
        <TopBar right="1P" onBack={() => { endRecovery(); router.replace('/home'); }} />
        <Header title="NOVA SENHA" lead="PRONTO, PLAYER 1." />
        <ResultWindow
          icon={<CheckIcon />}
          iconBg={colors.green}
          title="SENHA SALVA!"
          text="SUA SENHA FOI ALTERADA E VOCÊ JÁ ESTÁ CONECTADO. NOS OUTROS APARELHOS, USE A SENHA NOVA."
        />
      </Screen>
    );
  }

  if (recovery === 'checking') {
    return (
      <Screen gap={28}>
        <TopBar right="1P" onBack={() => undefined} />
        <Header title="NOVA SENHA" lead="VERIFICANDO O LINK" blink />
        <LoadState loading />
      </Screen>
    );
  }

  if (recovery === 'expired') {
    const leave = async () => {
      endRecovery();
      if (session) await signOut();
      router.replace('/forgot-password');
    };
    return (
      <Screen gap={28} footer={<PixelButton label="PEDIR NOVO LINK ›" onPress={leave} />}>
        <TopBar right="1P" onBack={() => { endRecovery(); router.replace('/'); }} />
        <Header title="NOVA SENHA" lead="O LINK NÃO FUNCIONOU." />
        <ResultWindow
          icon={<AlertIcon />}
          iconBg={colors.error}
          shadow={colors.line}
          title="LINK VENCIDO"
          text="ESTE LINK VENCEU OU JÁ FOI USADO. ELE VALE POR 1 HORA E SÓ FUNCIONA UMA VEZ. PEÇA OUTRO E USE O E-MAIL MAIS RECENTE."
        />
      </Screen>
    );
  }

  // Aberta sem link (ex.: digitou o endereço): volta para o começo.
  if (recovery !== 'active') return <Redirect href="/" />;

  const hint = (() => {
    if (error) return { text: '! ' + error.text, color: colors.error };
    if (!pw1) return null;
    if (pw1.length < MIN) return { text: `FALTAM ${MIN - pw1.length} CARACTERES.`, color: colors.dim };
    if (!pw2) return { text: 'AGORA REPITA A SENHA.', color: colors.dim };
    if (pw1 !== pw2) return { text: 'AS SENHAS AINDA NÃO SÃO IGUAIS.', color: colors.dim };
    return { text: 'TUDO CERTO, PODE SALVAR!', color: colors.green };
  })();

  async function submit() {
    if (pw1.length < MIN) return setError({ field: 1, text: 'A SENHA PRECISA TER PELO MENOS 8 CARACTERES.' });
    if (pw1 !== pw2) return setError({ field: 2, text: 'AS DUAS SENHAS NÃO SÃO IGUAIS.' });
    setBusy(true);
    try {
      await updatePassword(pw1);
      setDone(true);
    } catch (e) {
      const msg = errorMessage(e);
      setError({ field: 1, text: /different|same|diferente/i.test(msg) ? 'A SENHA NOVA PRECISA SER DIFERENTE DA ANTIGA.' : msg });
    } finally {
      setBusy(false);
    }
  }

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setError(null);
  };

  return (
    <Screen
      gap={28}
      footer={
        <PixelButton label="SALVAR SENHA ›" onPress={submit} loading={busy} />
      }
    >
      <TopBar right="1P" onBack={() => { endRecovery(); router.replace('/'); }} />
      <Header title="NOVA SENHA" lead="ESCOLHA UMA SENHA NOVA PARA VOLTAR AO SQUAD" blink />

      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <T>CONTA</T>
          <View style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.card, borderWidth: 3, borderStyle: 'dashed', borderColor: colors.border }}>
            <T size={9} color={colors.cyan}>{(session?.user.email ?? '').toUpperCase()}</T>
          </View>
        </View>
        <PixelInput
          label="NOVA SENHA"
          value={pw1}
          onChangeText={edit(setPw1)}
          placeholder="8+ CARACTERES"
          secureTextEntry={!show1}
          autoCapitalize="none"
          autoComplete="new-password"
          style={error?.field === 1 ? { borderColor: colors.error } : undefined}
          right={<ToggleButton shown={show1} onPress={() => setShow1((v) => !v)} />}
        />
        <View style={{ gap: 8 }}>
          <PixelInput
            label="REPITA A SENHA"
            value={pw2}
            onChangeText={edit(setPw2)}
            placeholder="••••••••"
            secureTextEntry={!show2}
            autoCapitalize="none"
            autoComplete="new-password"
            onSubmitEditing={submit}
            style={error?.field === 2 ? { borderColor: colors.error } : undefined}
            right={<ToggleButton shown={show2} onPress={() => setShow2((v) => !v)} />}
          />
          <View style={{ minHeight: 12 }} accessibilityLiveRegion="polite">
            {hint ? <T size={7} color={hint.color}>{hint.text}</T> : null}
          </View>
        </View>
      </View>
    </Screen>
  );
}

function Header({ title, lead, blink }: { title: string; lead: string; blink?: boolean }) {
  return (
    <View style={{ gap: 14 }}>
      <Title size={22}>{title}</Title>
      <T size={9} color={colors.muted}>
        {lead}
        {blink ? <Cursor /> : null}
      </T>
    </View>
  );
}

function ToggleButton({ shown, onPress }: { shown: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={shown ? 'Ocultar senha' : 'Mostrar senha'}
      style={({ pressed }) => ({
        width: 80,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
        borderWidth: 3,
        borderColor: colors.border,
        transform: pressed ? [{ translateX: 2 }, { translateY: 2 }] : [],
      })}
    >
      <T size={8} color={colors.cyan}>{shown ? 'OCULTAR' : 'VER'}</T>
    </Pressable>
  );
}

/** Janela de resultado, no mesmo estilo das janelas do canvas. */
function ResultWindow({ icon, iconBg, title, text, shadow = colors.pink }: { icon: ReactNode; iconBg: string; title: string; text: string; shadow?: string }) {
  return (
    <View style={{ padding: 20, gap: 14, backgroundColor: colors.bg, borderWidth: 4, borderColor: colors.text, boxShadow: pixelShadow(shadow) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg, borderWidth: 3, borderColor: colors.text }}>{icon}</View>
        <T size={13} color={colors.accent} accessibilityRole="header" style={{ flex: 1 }}>{title}</T>
      </View>
      <T size={7} color={colors.muted} style={{ lineHeight: 13 }}>{text}</T>
    </View>
  );
}

const CheckIcon = () => (
  <PixelArt grid={9} size={26} rects={[[0, 4, 2, 2, colors.bg], [2, 6, 2, 2, colors.bg], [4, 4, 2, 2, colors.bg], [6, 2, 2, 2, colors.bg], [8, 1, 1, 1, colors.bg]]} />
);
const AlertIcon = () => <PixelArt grid={8} size={26} rects={[[3, 0, 2, 5, colors.bg], [3, 6, 2, 2, colors.bg]]} />;
