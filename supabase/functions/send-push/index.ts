// Edge Function "send-push": recebe o Database Webhook da tabela `notifications`
// (INSERT e UPDATE) e manda o push pelo serviço da Expo para os celulares do jogador.
//
// Variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm do Supabase.
// Opcional: WEBHOOK_SECRET — se definir, configure o mesmo valor no header
// "x-webhook-secret" do webhook, para ninguém de fora chamar esta função.

type Notification = {
  id: number;
  user_id: string;
  kind: string;
  count: number;
  title: string;
  body: string;
  url: string;
  read_at: string | null;
};

type Payload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Notification | null;
  old_record: Notification | null;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('WEBHOOK_SECRET');
const SOUNDS = ['levelup', 'bip', 'power', 'mudo'];

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...(init.headers ?? {}) },
  });

Deno.serve(async (req) => {
  if (SECRET && req.headers.get('x-webhook-secret') !== SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  const p = (await req.json()) as Payload;
  const n = p.record;
  if (!n || p.table !== 'notifications' || p.type === 'DELETE') return new Response('ignorado');
  // UPDATE só interessa quando o agrupamento aumentou o contador (ex.: "3 JOGADORES ENTRARAM").
  if (p.type === 'UPDATE' && (n.read_at || p.old_record?.count === n.count)) return new Response('ignorado');

  // Som escolhido no Perfil (levelup, bip, power ou mudo).
  const prefRes = await rest(`profiles?id=eq.${n.user_id}&select=notif_prefs`);
  const som = ((await prefRes.json()) as { notif_prefs?: { som?: string } }[])[0]?.notif_prefs?.som ?? 'levelup';
  const sound = SOUNDS.includes(som) ? som : 'levelup';

  const tokensRes = await rest(`push_tokens?user_id=eq.${n.user_id}&select=token`);
  const tokens = ((await tokensRes.json()) as { token: string }[]).map((t) => t.token);
  if (tokens.length === 0) return new Response('sem aparelhos');

  // Número no ícone do app (iOS): notificações não lidas.
  const unreadRes = await rest(`notifications?user_id=eq.${n.user_id}&read_at=is.null&select=id`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  });
  const unread = Number(unreadRes.headers.get('content-range')?.split('/')[1] ?? '0') || undefined;

  const messages = tokens.map((to) => ({
    to,
    title: n.title,
    body: n.body,
    data: { url: n.url, notificationId: n.id },
    // iOS toca o arquivo pelo nome; no Android o som vem do canal.
    ...(sound === 'mudo' ? {} : { sound: `gp_${sound}.wav` }),
    badge: unread,
    channelId: `gp_${sound}`,
    priority: 'high',
  }));

  // A Expo aceita até 100 mensagens por requisição.
  const tickets: { status: string; details?: { error?: string } }[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    const j = await r.json();
    tickets.push(...(j.data ?? []));
  }

  // Aparelho que desinstalou o app ou tirou a permissão: apaga o token.
  const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
  for (const token of dead) {
    await rest(`push_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' });
  }

  return new Response(JSON.stringify({ sent: tokens.length - dead.length, removed: dead.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
