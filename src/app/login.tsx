import { router } from 'expo-router';
import { go } from '../lib/nav';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Cursor } from '../components/pixel';
import { ErrorText, PixelButton, PixelInput, Screen, T, Title, TopBar } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api';
import { colors } from '../theme';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen gap={24}>
      <TopBar right="1P" />
      <View style={{ gap: 14 }}>
        <Title size={22}>CONTINUE?</Title>
        <T size={9} color={colors.muted}>
          BEM-VINDO DE VOLTA. SEU SQUAD ESTÁ TE ESPERANDO
          <Cursor />
        </T>
      </View>

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
        placeholder="••••••••"
        secureTextEntry={!showPass}
        autoCapitalize="none"
        autoComplete="current-password"
        onSubmitEditing={submit}
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

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => go('/forgot-password')} accessibilityRole="link" style={{ paddingVertical: 12 }}>
          <T size={8} color={colors.cyan}>ESQUECI A SENHA</T>
        </Pressable>
      </View>

      <ErrorText>{error}</ErrorText>
      <PixelButton label="ENTRAR ›" onPress={submit} loading={busy} />

      <View style={{ flex: 1 }} />
      <Pressable onPress={() => router.replace('/signup')} accessibilityRole="link" style={{ alignSelf: 'center', padding: 8 }}>
        <T size={9} color={colors.dim}>
          NÃO TEM CONTA? <T size={9} color={colors.cyan}>CRIAR CONTA</T>
        </T>
      </Pressable>
    </Screen>
  );
}
