import { router } from 'expo-router';
import { View } from 'react-native';
import { Cursor } from '../components/pixel';
import { PixelButton, Screen, T, Title } from '../components/ui';
import { colors } from '../theme';

/** Link quebrado ou antigo (ex.: aviso de uma tela que mudou): "fase não encontrada" no estilo do app. */
export default function NotFound() {
  return (
    <Screen contentStyle={{ justifyContent: 'center' }} gap={28}>
      <View style={{ alignItems: 'center', gap: 22 }}>
        <T size={40} color={colors.host}>404</T>
        <Title size={16}>FASE NÃO ENCONTRADA</Title>
        <T size={9} color={colors.muted} style={{ textAlign: 'center' }}>
          {'ESSE LINK NÃO LEVA A LUGAR NENHUM.\nVOLTE PARA O INÍCIO'}
          <Cursor />
        </T>
      </View>
      <PixelButton label="VOLTAR AO INÍCIO" onPress={() => router.replace('/')} />
    </Screen>
  );
}
