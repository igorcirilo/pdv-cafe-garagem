import { useEffect, useState } from 'react';

/** Acompanha uma media query CSS (ex.: '(min-width: 768px)'). */
export function useMediaQuery(query: string): boolean {
  const ler = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [corresponde, setCorresponde] = useState(ler);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const atualizar = () => setCorresponde(mq.matches);
    atualizar();
    mq.addEventListener?.('change', atualizar);
    return () => mq.removeEventListener?.('change', atualizar);
  }, [query]);
  return corresponde;
}

/** Tablet (retrato) em diante: pedido fica fixo ao lado dos produtos. */
export const QUERY_TELA_LARGA = '(min-width: 768px)';
