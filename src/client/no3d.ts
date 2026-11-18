// No WebGL here, or its context lost (Fernando, Nov 18: the interface is only 3D, never an HTML one): one plain line in
// place of the whole page, the only text the game shows outside its 3D layer but for the turn-the-phone notice before
// a layer exists (rotate-note.ts).
import { t } from './i18n.ts';

export function no3d() {
  const p = document.createElement('p');
  p.setAttribute('role', 'alert');
  p.textContent = t(
    'O jogo precisa de WebGL e ele não está disponível agora. Recarregue a página; se continuar, abra em outro navegador.',
    'The game needs WebGL and it is not available right now. Reload the page; if it goes on, open it in another browser.',
  );
  document.body.replaceChildren(p);
}
