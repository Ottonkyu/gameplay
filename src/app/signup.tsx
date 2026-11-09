import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Checkbox, Chip, ErrorText, PixelButton, PixelInput, Screen, T, Title, TopBar, codeInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api';
import { colors, GENRES } from '../theme';

export default function Signup() {
  const { signUp } = useAuth();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [genres, setGenres] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleGenre = (g: string) => setGenres((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  async function submit() {
    setError(null);
    if (!terms) {
      setError('ACEITE OS TERMOS PARA CONTINUAR');
      return;
    }
    if (password.length < 8) {
      setError('A SENHA PRECISA TER PELO MENOS 8 CARACTERES');
      return;
    }
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp({ nickname, email, password, genres });
      // Sem confirmação de e-mail, o layout troca para as telas logadas sozinho.
      if (needsConfirmation) {
        Alert.alert('Confirme seu e-mail', 'Enviamos um link para ' + email.trim() + '. Depois de confirmar, é só entrar.');
        router.replace('/login');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <View style={{ gap: 12, alignItems: 'center' }}>
          <PixelButton label="CRIAR CONTA ›" onPress={submit} loading={busy} style={{ alignSelf: 'stretch' }} />
          <Pressable onPress={() => router.replace('/login')} accessibilityRole="link" style={{ padding: 8 }}>
            <T size={9} color={colors.dim}>
              JÁ TEM CONTA? <T size={9} color={colors.cyan}>ENTRAR</T>
            </T>
          </Pressable>
        </View>
      }
    >
      <TopBar right="NOVO JOGADOR" />
      <View style={{ gap: 12 }}>
        <Title>NOVO JOGADOR</Title>
        <T size={9} color={colors.muted}>CRIE SEU PERFIL E ENCONTRE SEU SQUAD.</T>
      </View>

      <PixelInput
        label="NICKNAME"
        value={nickname}
        onChangeText={(v) => setNickname(v.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
        placeholder="SEU_NICK"
        {...codeInput}
        maxLength={16}
      />
      <PixelInput
        label="E-MAIL"
        value={email}
        onChangeText={setEmail}
        placeholder="VOCE@EMAIL.COM"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
      />
      <PixelInput
        label="SENHA"
        value={password}
        onChangeText={setPassword}
        placeholder="8+ CARACTERES"
        secureTextEntry={!showPass}
        autoCapitalize="none"
        autoComplete="new-password"
        right={
          <PixelButton
            label={showPass ? 'OCULTAR' : 'VER'}
            accessibilityLabel={showPass ? 'Ocultar senha' : 'Mostrar senha'}
            variant="secondary"
            size="md"
            onPress={() => setShowPass((v) => !v)}
            shadow={false}
            style={{ width: 76, borderWidth: 3, borderColor: colors.border }}
          />
        }
      />

      <View style={{ gap: 10 }}>
        <T>
          O QUE VOCÊ JOGA? <T size={7} color={colors.dim}>({genres.length} ESCOLHIDOS)</T>
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {GENRES.map((g) => (
            <Chip key={g} compact label={g} selected={genres.includes(g)} onPress={() => toggleGenre(g)} />
          ))}
        </View>
      </View>

      <Checkbox checked={terms} onChange={setTerms} label="LI E ACEITO OS TERMOS DE USO E A POLÍTICA DE PRIVACIDADE" />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
