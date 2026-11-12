'use client';
import dynamic from 'next/dynamic';
const City = dynamic(() => import('@/components/City'), { ssr: false });
const TgWallet = dynamic(() => import('@/components/TgWallet'), { ssr: false });
export default function Page() { return <><City /><TgWallet /></>; }
