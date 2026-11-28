// The buttons that stay on the screen (Fernando, Nov 18 night: no ☰ menu anywhere): the gear opens Options, Undo takes
// a step back and ↺ ↻ turn the camera. Undo and the camera pair follow the screen buttons switch (screen-buttons.ts);
// Back is the HUD's (hud.ts), put in front of Undo. Drawn in 3D by window3d/tools3d.ts over these, unseen.
import type { HudActions } from './hud.ts';
import { t } from './i18n.ts';
import { el, icon, iconButton, UI_ICON } from './icons.ts';
import { onScreenButtons, screenButtons } from './screen-buttons.ts';

// the gear and the camera pair, the town's as the battle's: `rotate` turns the camera one of its 8 angles
export function gearButtons(menu: () => void, rotate: (dir: 1 | -1) => void) {
  const buttons = [
    iconButton(icon(UI_ICON.menu), t('Opções', 'Options'), menu, { class: 'icon gear' }),
    iconButton('↺', t('Girar a câmera para a esquerda', 'Turn the camera left'), () => rotate(-1), {
      class: 'icon turn-left',
    }),
    iconButton('↻', t('Girar a câmera para a direita', 'Turn the camera right'), () => rotate(1), {
      class: 'icon turn-right',
    }),
  ];
  const root = el('div', { class: 'tools' }, ...buttons);
  // the camera pair shows with the switch, and hides at once when Options turns it off
  const show = (on: boolean) => {
    for (const b of buttons.slice(1)) b.hidden = !on;
  };
  show(screenButtons());
  onScreenButtons(show);
  return { root, show };
}

export class CornerButtons {
  // Undo on the screen, left of the gear: always there while the switch is on, faded with no step to take back
  // (Fernando, Nov 18; setUndo)
  readonly undo: HTMLElement;
  // the top view beside ↺ ↻ (Fernando, Nov 25: T, R3, and a button for a finger); the battle's only, the town has none
  readonly top: HTMLElement;
  readonly root: HTMLElement;
  // the live map edit, for a finger (Nov 28: a tablet has no M and the Debug row needs ?debug=1); only a battle the
  // battle builder opened gives it something to do (setEdit, battleedit/live-mode.ts)
  private readonly edit = iconButton('✎', t('Editar o mapa', 'Edit the map'), () => this.run?.(), {
    class: 'icon edit-map',
    hidden: true,
  });
  private run?: () => void;
  private on = false;

  setEdit(run: () => void) {
    this.run = run;
    this.edit.hidden = !this.on;
  }

  constructor(act: HudActions) {
    const { root, show } = gearButtons(
      () => act.menu(),
      (dir) => act.rotate(dir),
    );
    this.undo = iconButton(
      '↶',
      t('Desfazer', 'Undo'),
      () => this.undo.getAttribute('aria-disabled') === 'true' || act.undo(),
      { class: 'icon undo', 'aria-disabled': 'true' },
    );
    root.prepend(this.undo);
    this.top = iconButton('⊞', t('Ver de cima', 'View from above'), () => act.top(), { class: 'icon top-view' });
    root.querySelector('.turn-right')?.after(this.top, this.edit);
    this.root = root;
    const both = (on: boolean) => {
      show(on);
      this.on = on;
      this.undo.hidden = this.top.hidden = !on;
      this.edit.hidden = !on || !this.run;
    };
    both(screenButtons());
    onScreenButtons(both);
  }

  // a step to take back or none: the button stays, faded and dead with none
  setUndo(can: boolean) {
    this.undo.setAttribute('aria-disabled', String(!can));
  }
}
