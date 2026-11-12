import { admin } from '@/lib/server';
import { verifyInitData } from '@/lib/tg';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const tok = process.env.TELEGRAM_BOT_TOKEN;
  if (!tok) return Response.json({ error: 'Bot tokeni sozlanmagan' }, { status: 500 });
  const u = verifyInitData(req.headers.get('x-init-data') || '', tok);
  if (!u?.id) return Response.json({ error: "Telegram tekshiruvi o'tmadi" }, { status: 401 });
  const { data, error } = await admin().rpc('tg_login', {
    p_id: u.id,
    p_name: [u.first_name, u.last_name].filter(Boolean).join(' '),
    p_user: u.username ?? null,
    p_photo: u.photo_url ?? null,
  });
  if (error) {
    console.error('tg_login', error.message);
    const blocked = error.message.includes('blocked');
    return Response.json({ error: blocked ? 'Akkaunt bloklangan' : 'Server xatosi' }, { status: blocked ? 403 : 500 });
  }
  return Response.json({
    user: { id: u.id, name: u.first_name, username: u.username, photo: u.photo_url },
    ...data,
    isAdmin: String(u.id) === process.env.ADMIN_TELEGRAM_ID,
  });
}
