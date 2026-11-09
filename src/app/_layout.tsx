import { PressStart2P_400Regular, useFonts } from '@expo-google-fonts/press-start-2p';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BootScreen } from '../components/BootScreen';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { DraftProvider } from '../context/DraftContext';
import { startClockSync } from '../lib/clock';
import { supabaseConfigured } from '../lib/supabase';
import { colors } from '../theme';

if (supabaseConfigured) startClockSync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PressStart2P_400Regular });
  // Se a fonte falhar, segue com a fonte do sistema em vez de travar.
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (!supabaseConfigured) {
    return (
      <ErrorView
        title="Supabase não configurado"
        error={new Error('Crie o arquivo .env com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY (veja .env.example e o README) e reinicie o Expo com "npx expo start -c".')}
        onRetry={() => undefined}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <DraftProvider>
            <AppGate />
          </DraftProvider>
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function AppGate() {
  const { session, ready, recovery } = useAuth();
  const user = session?.user ?? null;
  // Durante a troca de senha pelo link do e-mail, fica só na tela de nova senha.
  const resetting = recovery !== null;
  const [started, setStarted] = useState(false);

  if (!started) return <BootScreen ready={ready} onStart={() => setStarted(true)} />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reset-password" />
      {/* Sem login */}
      <Stack.Protected guard={!user && !resetting} redirectTo="/">
        <Stack.Screen name="welcome" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      {/* Com login */}
      <Stack.Protected guard={!!user && !resetting} redirectTo="/">
        <Stack.Screen name="home" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="pick-game" />
        <Stack.Screen name="pick-date" />
        <Stack.Screen name="pick-time" />
        <Stack.Screen name="match/[id]" />
        <Stack.Screen name="search" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="invite/[id]" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="avatar-editor" />
        <Stack.Screen name="history" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="chats" />
        <Stack.Screen name="chat/match/[id]" />
        <Stack.Screen name="chat/friend/[id]" />
      </Stack.Protected>
    </Stack>
  );
}

/** Mostra qualquer erro de renderização em vez de deixar a tela travada. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorView title="Algo deu errado" error={error} onRetry={retry} />;
}

function ErrorView({ title, error, onRetry }: { title: string; error: Error; onRetry: () => void }) {
  // Sem internet (na versão web as telas são baixadas na hora em que abrem): mensagem simples, sem código.
  const offline = /Loading module|Failed to fetch|Network request failed|NetworkError/i.test(error.message);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
          <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '700' }}>{offline ? 'Sem internet' : title}</Text>
          {offline ? (
            <Text style={{ color: colors.muted, fontSize: 14 }}>Confira o Wi-Fi ou os dados móveis e toque em TENTAR DE NOVO.</Text>
          ) : (
            <>
              <Text style={{ color: colors.muted, fontSize: 14 }}>Mande este texto para corrigir:</Text>
              <Text selectable style={{ color: colors.text, fontSize: 13, fontFamily: 'monospace' }}>
                {`${error.name}: ${error.message}\n\n${error.stack ?? ''}`}
              </Text>
            </>
          )}
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            style={{ backgroundColor: colors.accent, padding: 16, alignItems: 'center' }}
          >
            <Text style={{ color: colors.bg, fontWeight: '700' }}>TENTAR DE NOVO</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
