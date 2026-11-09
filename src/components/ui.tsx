import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { KeyboardAvoidingView, KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller';
import type { ScrollViewInstance } from 'react-native';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  RefreshControl,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, pixelShadow, FONT_SCALE_MAX } from '../theme';

/* ---------- Texto ---------- */

type TProps = TextProps & { size?: number; color?: string; style?: StyleProp<TextStyle> };

/** Texto na fonte pixelada. A Press Start 2P precisa de line-height generoso. */
export function T({ size = 10, color = colors.text, style, ...rest }: TProps) {
  return <Text maxFontSizeMultiplier={FONT_SCALE_MAX} {...rest} style={[{ fontFamily: font, fontSize: size, lineHeight: Math.round(size * 1.7), color }, style]} />;
}

/**
 * Rótulo curto de botão/chip fica numa linha só e encolhe um pouco se não couber
 * (fonte grande do celular, telas estreitas). Rótulos longos podem quebrar linha.
 */
export const fitLabel = (label: string) =>
  // Na web o navegador não encolhe a fonte (só cortaria com "..."), então lá fica como estava.
  Platform.OS !== 'web' && label.length <= 18 ? ({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6 } as const) : {};

/**
 * Se a ação do botão é assíncrona (devolve Promise, ex.: chamada ao servidor), ignora novos
 * toques até ela terminar. Evita requisição em dobro no Android lento. Ações instantâneas
 * (setas do relógio etc.) continuam livres para toques rápidos.
 */
export function useSafePress(onPress?: () => unknown) {
  const locked = useRef(false);
  return useCallback(() => {
    if (!onPress || locked.current) return;
    const result = onPress();
    if (result instanceof Promise) {
      locked.current = true;
      result.then(
        () => (locked.current = false),
        () => (locked.current = false),
      );
    }
  }, [onPress]);
}

/* ---------- Tela ---------- */

/** Linhas horizontais escuras que imitam uma tela CRT. Só visual. */
export const Scanlines = memo(function Scanlines() {
  const lines = useMemo(() => Array.from({ length: 260 }, (_, i) => i), []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {lines.map((i) => (
        <View key={i} style={{ height: 2, marginBottom: 2, backgroundColor: 'rgba(0,0,0,0.22)' }} />
      ))}
    </View>
  );
});

type ScreenProps = {
  children: ReactNode;
  /** Puxar para atualizar. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Camada por cima (janelas). */
  overlay?: ReactNode;
  /** Botão fixo no rodapé (ex.: CONFIRMAR). */
  footer?: ReactNode;
  scroll?: boolean;
  /** Para a tela rolar sozinha até uma seção. */
  scrollRef?: RefObject<ScrollViewInstance | null>;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, footer, scroll = true, scrollRef, gap = 20, contentStyle, refreshing, onRefresh, overlay }: ScreenProps) {
  const content = [{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, gap }, contentStyle];
  const keyboardOpen = useKeyboardState((k) => k.isVisible);
  const insets = useSafeAreaInsets();
  // Teclado no Android em tela cheia (edge-to-edge) e no iOS:
  // - telas com rolagem: a lista rola até o campo focado. Com o teclado aberto, os botões do
  //   rodapé descem para o fim da lista (dá para rolar até eles) em vez de flutuar por cima
  //   dos campos; com o teclado fechado, voltam a ficar fixos embaixo.
  // - telas fixas (chat): a tela encolhe e o rodapé fica logo acima do teclado.
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={scroll ? ['top', 'bottom'] : ['top']}>
        {scroll ? (
          <>
            <KeyboardAwareScrollView
              ref={scrollRef as never}
              style={styles.flex}
              contentContainerStyle={[{ flexGrow: 1 }, content]}
              keyboardShouldPersistTaps="handled"
              bottomOffset={24}
              refreshControl={
                onRefresh ? (
                  <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
                ) : undefined
              }
            >
              {children}
              {footer && keyboardOpen ? <View style={{ marginTop: 'auto', paddingTop: 8 }}>{footer}</View> : null}
            </KeyboardAwareScrollView>
            {footer && !keyboardOpen ? <View style={styles.footer}>{footer}</View> : null}
          </>
        ) : (
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            <View style={[styles.flex, content]}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
            {/* espaço da barra do sistema só com o teclado fechado (aberto, ele já cobre essa área) */}
            <View style={{ height: keyboardOpen ? 0 : insets.bottom }} />
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
      <Scanlines />
      {overlay}
    </View>
  );
}

/** Barra do topo: "‹ VOLTAR" e um rótulo à direita. */
export function TopBar({ right, onBack }: { right?: string; onBack?: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        hitSlop={8}
        style={{ paddingVertical: 14, paddingRight: 12 }}
      >
        <T color={colors.cyan}>‹ VOLTAR</T>
      </Pressable>
      {right ? <T color={colors.dim}>{right}</T> : null}
    </View>
  );
}

export function Title({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <T
      size={size}
      accessibilityRole="header"
      style={{ textShadowColor: colors.pink, textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 }}
      color={colors.accent}
    >
      {children}
    </T>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <T size={9} color={colors.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
      ! {children}
    </T>
  );
}

/* ---------- Botões ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'danger';

type PixelButtonProps = {
  label: string;
  onPress?: () => unknown;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  size?: 'lg' | 'md';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** false = botão "achatado", sem sombra (ex.: VER/OCULTAR senha). */
  shadow?: boolean;
};

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string; shadow: string }> = {
  primary: { bg: colors.accent, fg: colors.bg, border: colors.text, shadow: colors.pink },
  secondary: { bg: colors.bg, fg: colors.text, border: colors.text, shadow: colors.cyan },
  danger: { bg: colors.bg, fg: colors.host, border: colors.host, shadow: colors.line },
};

export function PixelButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  size = 'lg',
  style,
  accessibilityLabel,
  shadow = true,
}: PixelButtonProps) {
  const v = VARIANTS[variant];
  const off = disabled || loading;
  const press = useSafePress(onPress);
  return (
    <Pressable
      onPress={press}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        {
          height: size === 'lg' ? 60 : 48,
          backgroundColor: v.bg,
          borderColor: v.border,
          boxShadow: pressed || !shadow ? undefined : pixelShadow(v.shadow),
          transform: pressed ? [{ translateX: 4 }, { translateY: 4 }] : [],
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <T size={size === 'lg' ? 13 : 10} color={v.fg} {...fitLabel(label)}>{label}</T>}
    </Pressable>
  );
}

/** Botão pequeno de seleção (categoria, gênero, atalho de horário). */
export function Chip({
  label,
  selected,
  onPress,
  style,
  color = colors.accent,
  compact,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  color?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        compact && { height: 38, paddingHorizontal: 10 },
        disabled && { opacity: 0.35 },
        {
          backgroundColor: selected ? color : colors.bg,
          borderColor: selected ? colors.text : colors.border,
          borderStyle: selected ? 'solid' : 'dashed',
          transform: pressed ? [{ translateX: 2 }, { translateY: 2 }] : [],
        },
        style,
      ]}
    >
      <T size={compact ? 7 : 9} color={selected ? colors.bg : colors.muted} style={disabled ? { textDecorationLine: 'line-through' } : undefined} {...fitLabel(label)}>
        {label}
      </T>
    </Pressable>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.checkRow}
      hitSlop={6}
    >
      <View style={[styles.checkBox, checked && { backgroundColor: colors.accent }]}>
        {checked ? <T size={10} color={colors.bg}>✓</T> : null}
      </View>
      <T size={8} color={colors.muted} style={{ flex: 1 }}>
        {label}
      </T>
    </Pressable>
  );
}

/* ---------- Campos ---------- */

/**
 * Campos que o app passa para MAIÚSCULAS. No Android, se o teclado manda minúsculas
 * com sugestões ligadas e o app troca o texto, o teclado e o React "brigam" pelo campo
 * e as letras se repetem. Com o teclado já em maiúsculas e sem sugestões, não briga.
 */
export const capsInput = { autoCapitalize: 'characters', autoCorrect: false, spellCheck: false } as const;
/** Nick e código da sala: também desliga a composição/sugestões do teclado no Android. */
export const codeInput = {
  ...capsInput,
  autoComplete: 'off',
  importantForAutofill: 'no',
  keyboardType: Platform.OS === 'android' ? 'visible-password' : 'default',
} as const;

type PixelInputProps = TextInputProps & {
  label: string;
  error?: string | null;
  right?: ReactNode;
  counter?: string;
};

export function PixelInput({ label, error, right, counter, style, multiline, ...rest }: PixelInputProps) {
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.labelRow}>
        <T>{label}</T>
        {counter ? <T size={7} color={colors.dim}>{counter}</T> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          maxFontSizeMultiplier={FONT_SCALE_MAX}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.accent}
          multiline={multiline}
          style={[
            styles.input,
            multiline && { height: 96, paddingTop: 12, textAlignVertical: 'top' },
            error ? { borderColor: colors.error } : null,
            style,
          ]}
          {...rest}
        />
        {right}
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** Campo que abre outra tela (jogo, data, hora). */
export function FieldLink({
  label,
  value,
  placeholder,
  onPress,
  leading,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  leading?: ReactNode;
}) {
  return (
    <View style={{ gap: 8, flex: 1 }}>
      <T>{label}</T>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? 'não escolhido'}`}
        style={({ pressed }) => [styles.fieldLink, pressed && { borderColor: colors.text }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          {leading}
          <T size={10} color={value ? colors.text : colors.placeholder} numberOfLines={1} style={{ flexShrink: 1 }}>
            {value ?? placeholder}
          </T>
        </View>
        <T color={colors.accent}>›</T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  footer: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { borderWidth: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  chip: { height: 44, paddingHorizontal: 12, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  checkBox: {
    width: 24,
    height: 24,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: font,
    fontSize: 11,
  },
  fieldLink: {
    height: 52,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});

/* ---------- Peças extras ---------- */

/** Etiqueta colorida (categoria, status, papel). */
export function Tag({ label, bg = colors.accent, fg = colors.bg, size = 7 }: { label: string; bg?: string; fg?: string; size?: number }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 6, backgroundColor: bg, borderWidth: 2, borderColor: colors.text }}>
      <T size={size} color={fg}>{label}</T>
    </View>
  );
}

/** Botão pequeno de contorno (EDITAR, + CONVIDAR, REMOVER...). */
export function SmallButton({
  label,
  onPress,
  color = colors.cyan,
  filled,
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => unknown;
  color?: string;
  filled?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const press = useSafePress(onPress);
  return (
    <Pressable
      onPress={press}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        {
          minHeight: 36,
          paddingHorizontal: 10,
          borderWidth: 3,
          borderColor: disabled ? colors.line : filled ? colors.text : color,
          backgroundColor: filled && !disabled ? color : colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          transform: pressed ? [{ translateX: 2 }, { translateY: 2 }] : [],
        },
        style,
      ]}
    >
      <T size={7} color={disabled ? colors.dim : filled ? colors.bg : color} style={{ textAlign: 'center' }} {...fitLabel(label)}>
        {label}
      </T>
    </Pressable>
  );
}

/** Mensagem curta de retorno (sucesso/erro/dica). */
export function Note({ text, tone = 'hint' }: { text?: string | null; tone?: 'hint' | 'ok' | 'error' | 'warn' }) {
  if (!text) return null;
  const color = tone === 'ok' ? colors.green : tone === 'error' ? colors.error : tone === 'warn' ? colors.accent : colors.dim;
  return (
    <T size={7} color={color} accessibilityLiveRegion="polite">
      {text}
    </T>
  );
}

export function Box({ children, style, dashed }: { children: ReactNode; style?: StyleProp<ViewStyle>; dashed?: boolean }) {
  return (
    <View
      style={[
        { padding: 12, backgroundColor: colors.card, borderWidth: 3, borderColor: dashed ? colors.border : colors.line, borderStyle: dashed ? 'dashed' : 'solid', gap: 10 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 36 }}>
      <T size={10} accessibilityRole="header">{title}</T>
      {right}
    </View>
  );
}

/** Carregando / erro / vazio, no estilo do app. */
export function LoadState({ loading, error, onRetry }: { loading?: boolean; error?: string | null; onRetry?: () => void }) {
  if (loading) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center', gap: 14 }}>
        <ActivityIndicator color={colors.accent} />
        <T size={8} color={colors.dim}>CARREGANDO...</T>
      </View>
    );
  }
  if (error) {
    return (
      <Box dashed style={{ alignItems: 'center' }}>
        <T size={8} color={colors.error} style={{ textAlign: 'center' }}>{error}</T>
        {onRetry ? <SmallButton label="TENTAR DE NOVO" onPress={onRetry} /> : null}
      </Box>
    );
  }
  return null;
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: 22, borderWidth: 3, borderStyle: 'dashed', borderColor: colors.line }}>
      <T size={8} color={colors.dim} style={{ textAlign: 'center' }}>{text}</T>
    </View>
  );
}

/** Altura do teclado aberto (0 se fechado). Funciona também dentro de Modal. */
function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, (e) => setH(e.endCoordinates.height));
    const b = Keyboard.addListener(hideEvt, () => setH(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return h;
}

/** Janela que sobe de baixo (convites, remover, confirmar...). */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  accent = colors.accent,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accent?: string;
  children: ReactNode;
}) {
  // A janela é um Modal (outra "janela" no Android): sobe a folha na altura do teclado,
  // senão o campo (ex.: código GP-XXXX) fica embaixo do teclado.
  // No Android o React Native informa a altura do teclado SEM a barra de navegação (◁ ○ □),
  // mas o Modal ocupa a tela inteira por baixo dela: soma a barra, senão os botões ficam
  // meio tapados. Com o teclado aberto a folha já fica acima da barra, então tira o recuo de baixo.
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const open = keyboard > 0;
  const lift = open ? keyboard + (Platform.OS === 'android' ? insets.bottom : 0) : 0;
  // Altura máxima no espaço que sobra acima do teclado (folhas longas rolam por dentro).
  const maxHeight = Math.max(200, (useWindowDimensions().height - lift - insets.top) * 0.95);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(14, 8, 32, 0.88)', justifyContent: 'flex-end', paddingBottom: lift }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
        <SafeAreaView edges={open ? [] : ['bottom']} style={{ backgroundColor: colors.bg, borderTopWidth: 4, borderTopColor: accent, maxHeight }}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1, gap: 8 }}>
                  <T size={12} color={accent} accessibilityRole="header">{title}</T>
                  {subtitle ? <T size={7} color={colors.dim}>{subtitle}</T> : null}
                </View>
                <SmallButton label="✕" color={colors.text} onPress={onClose} accessibilityLabel="Fechar" style={{ width: 40, height: 40 }} />
              </View>
              {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Confirmação "SIM / NÃO" no estilo do app. */
export function ConfirmSheet({
  visible,
  title,
  text,
  confirmLabel,
  cancelLabel = 'VOLTAR',
  tone = 'danger',
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'good';
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const accent = tone === 'good' ? colors.green : colors.error;
  return (
    <Sheet visible={visible} onClose={onClose} title={title} accent={accent}>
      <Box dashed>
        <T size={7} color={colors.muted}>{text}</T>
      </Box>
      {children}
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <PixelButton label={cancelLabel} variant="secondary" size="md" shadow={false} onPress={onClose} style={{ flex: 1 }} />
        <PixelButton
          label={confirmLabel}
          size="md"
          loading={busy}
          onPress={onConfirm}
          style={{ flex: 1, backgroundColor: accent }}
        />
      </View>
    </Sheet>
  );
}
