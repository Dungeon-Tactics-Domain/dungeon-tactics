// Protagonista criado pelo jogador (noite de 12/11, pedido do Fernando: "pode ter criação de personagem"). Puro e
// testado; a tela fica em create-ui.ts. O protagonista entra no lugar do companheiro da mesma classe nas batalhas da
// campanha (group.ts, heroesFor) (o companheiro segue nas conversas, como os convidados do FFT): os mapas têm 4 casas de partida de herói.
export const HERO_CLASSES = ['warrior', 'archer', 'mage', 'rogue'] as const;
export type HeroClass = (typeof HERO_CLASSES)[number];
export interface Hero {
  name: string;
  cls: HeroClass;
}
export const HERO_KEY = 'dt:heroi';
export const NAME_MAX = 16;

// fronteira de confiança: o herói salvo vem do navegador; só passa nome de 1 a 16 letras e uma das 4 classes
export function parseHero(raw: unknown): Hero | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name || name.length > NAME_MAX || !HERO_CLASSES.includes(r.cls as HeroClass)) return null;
  return { name, cls: r.cls as HeroClass };
}
