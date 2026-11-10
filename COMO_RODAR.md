<!-- Guia completo. O README traz só o resumo. -->
# Como rodar o GamePlay

## 1. Banco (Supabase)

1. Crie um projeto em <https://supabase.com>.
2. No **SQL Editor**, rode, em ordem, todos os arquivos de `supabase/migrations` (`0001` a `0007`).
3. Em **Authentication → Sign In / Providers → Email**, desligue **Confirm email** para testar mais rápido. Se deixar ligado, o app pede a confirmação antes de entrar.
4. **Esqueci a senha:** em **Authentication → URL Configuration → Redirect URLs**, adicione `gameplay://**` (APK), `exp://**` (Expo Go) e `http://localhost:8081/**` (navegador) e `https://SEU-USUARIO.github.io/gameplay/**` (página reserva). O link do e-mail abre a tela de nova senha no próprio app. Em **Site URL**, coloque `https://SEU-USUARIO.github.io/gameplay/redefinir-senha.html` (cole a chave publishable nesse arquivo): é a página usada quando o link não pode abrir o app.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **publishable/anon**.

> No plano grátis, o projeto pausa depois de 1 semana sem uso. Ele pode ser reativado pelo painel.

## 1b. Notificações push (opcional, mas recomendado)

A central de notificações (o sininho) já funciona só com as migrações. Para o aviso **chegar no celular**:

1. **Lembretes de horário:** em **Integrations → Cron**, ative o pg_cron e rode no SQL Editor:
   `select cron.schedule('gameplay-reminders', '* * * * *', 'select public.run_match_reminders()');`
   Sem o cron, os lembretes ainda saem, mas só quando alguém está com o app aberto.
2. **Edge Function:** em **Edge Functions → Deploy a new function**, crie `send-push` e cole `supabase/functions/send-push/index.ts`. Se preferir o terminal: `npx supabase functions deploy send-push`.
3. **Webhook:** em **Database → Webhooks → Create**, escolha a tabela `notifications`, os eventos **Insert** e **Update** e o tipo **Supabase Edge Functions → send-push**.
4. **Android (FCM):** o push da Expo no Android passa pelo Firebase. Crie um projeto no Firebase, baixe o `google-services.json`, aponte para ele em `app.json` (`android.googleServicesFile`) e envie a chave FCM V1 com `npx eas-cli@latest credentials`.
5. **Sons:** os arquivos de `assets/sounds` entram no app pelo plugin do `expo-notifications`. No Android, cada som é um canal (`gp_levelup`, `gp_bip`, `gp_power`, `gp_mudo`), porque o som de um canal não muda depois de criado. Por isso a Edge Function escolhe o canal pelo som salvo no perfil. Os sons personalizados só tocam no APK ou no development build.
6. **Testar:** o push remoto **não funciona no Expo Go no Android**. Use o APK (`--profile preview`) ou um development build. O `npx eas-cli@latest init` grava o `projectId`, que o app precisa para pedir o token.

## 2. App

```bash
npm install
cp .env.example .env      # preencha URL e chave do Supabase
npx expo start -c         # abra no Expo Go (QR code) ou aperte "w" para o navegador
```

## 3. APK para Android

```bash
npx eas-cli@latest build -p android --profile preview
```

Cadastre as duas variáveis do `.env` em **expo.dev → projeto → Environment variables** antes do build.

> Desde 30/09/2026, no Brasil, apps instalados fora da Play Store precisam de desenvolvedor cadastrado no Android Developer Console. A conta de **distribuição limitada** é grátis para até 20 aparelhos.

## 4. Testes do banco

```bash
PGHOST=localhost PGUSER=postgres npm run db:test   # PostgreSQL local, com auth simulado
```

## 5. Versão web (para quem usa iPhone)

```bash
npx expo export -p web
npx eas-cli@latest deploy --prod
```

O comando devolve um link `https://….expo.app` que abre o app no navegador.
