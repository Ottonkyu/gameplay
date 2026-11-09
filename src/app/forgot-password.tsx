import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { sendPasswordReset } from '../api';
import { Cursor } from '../components/pixel';
import { ErrorText, Note, PixelButton, PixelInput, Screen, T, Title, TopBar } from '../components/ui';
import { useAction } from '../lib/hooks';
import { colors } from '../theme';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, setError, run } = useAction();

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('DIGITE UM E-MAIL VÁLIDO.');
      return;
    }
    const ok = await run(async () => {
      await sendPasswordReset(email);
      return true;
    });
    if (ok) setSent(true);
  }

  return (
    <Screen
      gap={28}
      footer={
        <View style={{ gap: 12, alignItems: 'center' }}>
          <PixelButton label={sent ? 'LINK ENVIADO ✓' : 'ENVIAR LINK ›'} onPress={submit} loading={busy} disabled={sent} style={{ alignSelf: 'stretch' }} />
          <Pressable onPress={() => router.replace('/login')} accessibilityRole="link" style={{ padding: 8 }}>
            <T size={9} color={colors.dim}>
              LEMBROU? <T size={9} color={colors.cyan}>ENTRAR</T>
            </T>
          </Pressable>
        </View>
      }
    >
      <TopBar right="1P" />
      <View style={{ gap: 14 }}>
        <Title size={22}>ESQUECI A SENHA</Title>
        <T size={9} color={colors.muted}>
          DIGITE O E-MAIL DA SUA CONTA. VAMOS MANDAR UM LINK PARA VOCÊ CRIAR UMA SENHA NOVA
          <Cursor />
        </T>
      </View>
      <PixelInput
        label="E-MAIL"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setSent(false);
        }}
        placeholder="VOCE@EMAIL.COM"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      {sent ? <Note tone="ok" text={`✓ SE EXISTIR UMA CONTA COM ${email.trim().toUpperCase()}, O LINK CHEGA EM ALGUNS MINUTOS. ABRA ESSE E-MAIL NO CELULAR COM O GAMEPLAY INSTALADO. CONFIRA O SPAM.`} /> : null}
    </Screen>
  );
}
