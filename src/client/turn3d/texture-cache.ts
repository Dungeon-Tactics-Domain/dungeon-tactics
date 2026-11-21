// The turn list's pictures (faces and the ability icons' atlas), each loaded once by URL: a caller gets the texture at
// once and its image when it arrives (split from turn3d.ts)
import { Texture, TextureLoader } from 'three';

type Loaded = (img: HTMLImageElement) => void;

export class TextureCache {
  private readonly loader = new TextureLoader();
  private readonly textures = new Map<string, { tex: Texture; waiting: Loaded[] | null }>();
  constructor(private readonly wake: () => void) {}

  get(url: string, loaded: Loaded) {
    let entry = this.textures.get(url);
    if (!entry) {
      const made = { tex: new Texture(), waiting: [] as Loaded[] | null };
      made.tex = this.loader.load(url, (tex) => {
        for (const run of made.waiting ?? []) run(tex.image as HTMLImageElement);
        made.waiting = null;
        this.wake();
      });
      made.tex.flipY = false;
      this.textures.set(url, (entry = made));
    }
    if (entry.waiting) entry.waiting.push(loaded);
    else loaded(entry.tex.image as HTMLImageElement);
    return entry.tex;
  }

  dispose() {
    for (const e of this.textures.values()) e.tex.dispose();
  }
}
