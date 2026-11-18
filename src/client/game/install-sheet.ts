// The sheet an iPhone or iPad gets from the title's install line (install.ts): Safari cannot be asked to install, so it
// says where the Share menu is. Same window and 3D sheet as Credits (sheets.ts).
import { dialog } from '../dialog.ts';
import { t } from '../i18n.ts';
import { button } from '../icons.ts';
import { INSTALL_LABEL, installHelpText } from '../install.ts';
import { type Block, blocksHtml, showSheet } from './sheets.ts';

export function installHelp(back: () => void) {
  const title = INSTALL_LABEL(),
    blocks: Block[] = [{ k: 'text', str: installHelpText() }];
  const d = dialog(
    'title',
    title,
    [
      ...blocksHtml(blocks),
      button('primary', t('Voltar', 'Back'), () => {
        d.close();
        back();
      }),
    ],
    { onBack: back },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  showSheet(d.overlay, { title, blocks });
}
