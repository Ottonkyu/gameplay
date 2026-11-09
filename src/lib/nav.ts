import { router, type Href } from 'expo-router';

/**
 * Abre uma tela. Toque duplo (comum em Android lento) não empilha a mesma tela duas vezes:
 * o mesmo destino repetido em menos de 800 ms é ignorado.
 */
let last = { key: '', at: 0 };
export function go(href: Href) {
  const key = typeof href === 'string' ? href : JSON.stringify(href);
  const now = Date.now();
  if (key === last.key && now - last.at < 800) return;
  last = { key, at: now };
  router.push(href);
}
