'use client';
import { useEffect, useState } from 'react';

type Me = { user: { id: number; name: string; username?: string; photo?: string }; balance: number; bonus: boolean; isAdmin: boolean };
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US').replace(/,/g, ' ');
const box: React.CSSProperties = { position: 'fixed', left: 12, zIndex: 8, background: '#fbf0dc', border: '3px solid #e9d6b0', borderRadius: 18, boxShadow: '0 4px 0 #c9b387', color: '#3b2412', fontFamily: 'Nunito, system-ui, sans-serif', fontWeight: 900 };

export default function TgWallet() {
  const [me, setMe] = useState<Me | null>(null), [open, setOpen] = useState(false), [err, setErr] = useState(''), [inTg, setInTg] = useState(true);
  useEffect(() => {
    const go = async () => {
      const w = (window as any).Telegram?.WebApp;
      if (!w?.initData) return setInTg(false);
      w.ready(); w.expand();
      try {
        const r = await fetch('/api/me', { method: 'POST', headers: { 'x-init-data': w.initData } });
        const j = await r.json();
        if (!r.ok) return setErr(j.error || 'Xato');
        setMe(j); if (j.bonus) setOpen(true);
      } catch { setErr('Aloqa xatosi'); }
    };
    if ((window as any).Telegram?.WebApp) { go(); return; }
    const s = document.createElement('script'); s.src = 'https://telegram.org/js/telegram-web-app.js'; s.onload = go; s.onerror = () => setInTg(false);
    document.head.appendChild(s);
  }, []);

  if (!inTg) return <div style={{ ...box, top: 76, padding: '8px 12px', fontSize: 13 }}>📱 Telegram bot orqali oching</div>;
  if (err) return <div style={{ ...box, top: 76, padding: '8px 12px', fontSize: 13 }}>⚠️ {err}</div>;
  if (!me) return null;
  return <>
    <button onClick={() => setOpen(!open)} style={{ ...box, top: 76, padding: '8px 12px', fontSize: 14, cursor: 'pointer' }}>💰 {fmt(me.balance)} $m</button>
    {open && <div style={{ ...box, top: 122, padding: 14, width: 'min(320px, calc(100vw - 24px))', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {me.user.photo && <img src={me.user.photo} alt="" width={44} height={44} style={{ borderRadius: '50%' }} />}
        <div><div>{me.user.name}</div><small>{me.user.username ? '@' + me.user.username : ''} · ID {me.user.id}</small></div>
      </div>
      <div style={{ fontSize: 20 }}>Balans: {fmt(me.balance)} $m</div>
      {me.bonus && <div style={{ color: '#2e7d32' }}>🎁 Boshlang&apos;ich bonus: 1 000 $m berildi!</div>}
      <small style={{ fontWeight: 700 }}>$m — virtual o&apos;yin valyutasi. Uni pulga almashtirib yoki yechib bo&apos;lmaydi.</small>
      <button onClick={() => setOpen(false)} style={{ font: 'inherit', padding: 8, borderRadius: 12, border: '2px solid #b08a55', background: '#fff7e6', cursor: 'pointer' }}>Yopish</button>
    </div>}
  </>;
        }
