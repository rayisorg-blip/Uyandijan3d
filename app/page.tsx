'use client';
import dynamic from 'next/dynamic';
const City = dynamic(() => import('@/components/City'), { ssr: false });
export default function Page() { return <City />; }
