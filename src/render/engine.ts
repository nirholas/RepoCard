import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { resolvePalette } from '../design/validate';
import { toBase64 } from '../lib/base64';
import type { DesignSpec, RenderOptions } from '../design/types';
import { backgroundSvg, injectBackground } from './background';
import { HEIGHT, WIDTH, type CardRepo } from './components';
import { FONT_ROLES, type FontFace } from './fonts';
import { LAYOUT_DECOR, LAYOUT_RENDERERS } from './layouts';

type WasmInput = WebAssembly.Module | ArrayBuffer | Uint8Array;

/** Satori's render function. Workers use @cf-wasm/satori (workerd build); Node uses @cf-wasm/satori/node. */
export type SatoriFn = (element: never, options: never) => Promise<string>;

export interface EngineDeps {
  satori: SatoriFn;
  resvg: WasmInput;
  fonts: FontFace[];
  /** Used for emoji and non-Latin fallback fonts. Defaults to global fetch. */
  fetcher?: typeof fetch;
}

export interface CardInput {
  spec: DesignSpec;
  repo: CardRepo;
  avatar: string | null;
  options: RenderOptions;
}

const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg';

/** Satori locale code to the Noto family that covers it. */
const NOTO: Record<string, string> = {
  'ja-JP': 'Noto Sans JP',
  'ko-KR': 'Noto Sans KR',
  'zh-CN': 'Noto Sans SC',
  'zh-TW': 'Noto Sans TC',
  'zh-HK': 'Noto Sans HK',
  'th-TH': 'Noto Sans Thai',
  'bn-IN': 'Noto Sans Bengali',
  'ar-AR': 'Noto Sans Arabic',
  'ta-IN': 'Noto Sans Tamil',
  'ml-IN': 'Noto Sans Malayalam',
  'he-IL': 'Noto Sans Hebrew',
  'te-IN': 'Noto Sans Telugu',
  devanagari: 'Noto Sans Devanagari',
  kannada: 'Noto Sans Kannada',
};

/** Pick a Noto family for text Satori could not render with the bundled fonts. */
export function notoFamily(code: string, segment: string): string {
  if (NOTO[code]) return NOTO[code]!;
  if (/[\u3040-\u30ff]/.test(segment)) return 'Noto Sans JP';
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(segment)) return 'Noto Sans KR';
  if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(segment)) return 'Noto Sans SC';
  if (/[\u0600-\u06ff]/.test(segment)) return 'Noto Sans Arabic';
  if (/[\u0590-\u05ff]/.test(segment)) return 'Noto Sans Hebrew';
  if (/[\u0e00-\u0e7f]/.test(segment)) return 'Noto Sans Thai';
  if (/[\u0900-\u097f]/.test(segment)) return 'Noto Sans Devanagari';
  if (/[\u2190-\u2bff]/.test(segment)) return 'Noto Sans Symbols 2';
  return 'Noto Sans';
}

/** Twemoji file name for an emoji: code points in hex, FE0F dropped unless part of a ZWJ sequence. */
export function emojiCode(emoji: string): string {
  const points = [...emoji].map((c) => c.codePointAt(0)!);
  const keep = points.includes(0x200d) ? points : points.filter((p) => p !== 0xfe0f);
  return keep.map((p) => p.toString(16)).join('-');
}

export class RenderEngine {
  private ready: Promise<void> | null = null;
  private readonly fetcher: typeof fetch;

  constructor(private readonly deps: EngineDeps) {
    this.fetcher = deps.fetcher ?? ((i, init) => fetch(i, init));
  }

  /**
   * Start WebAssembly initialization. Call at module scope in Workers so the
   * promise is not owned by (and cancelled with) the first request.
   */
  warm(): Promise<void> {
    return this.init();
  }

  private init(): Promise<void> {
    this.ready ??= initWasm(this.deps.resvg as never).then(
      () => undefined,
      (err: unknown) => {
        // resvg throws if initialized twice (e.g. a second engine in one isolate); that is fine.
        if (String(err).includes('Already initialized')) return;
        this.ready = null;
        throw err;
      },
    );
    return this.ready;
  }

  async svg(input: CardInput): Promise<string> {
    await this.init();
    const ctx = {
      spec: input.spec,
      palette: resolvePalette(input.spec),
      fonts: FONT_ROLES[input.spec.font],
      repo: input.repo,
      avatar: input.avatar,
      options: input.options,
    };
    const element = LAYOUT_RENDERERS[input.spec.layout](ctx);
    const svg = await this.deps.satori(element as never, {
      width: WIDTH,
      height: HEIGHT,
      fonts: this.deps.fonts,
      loadAdditionalAsset: (code: string, segment: string) => this.loadAsset(code, segment),
    } as never);
    return injectBackground(svg, backgroundSvg(input.spec.background, ctx.palette) + (LAYOUT_DECOR[input.spec.layout]?.(ctx) ?? ''));
  }

  async png(input: CardInput): Promise<Uint8Array> {
    const svg = await this.svg(input);
    return this.rasterize(svg);
  }

  async rasterize(svg: string): Promise<Uint8Array> {
    await this.init();
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH }, font: { loadSystemFonts: false } });
    const rendered = resvg.render();
    const png = rendered.asPng();
    rendered.free();
    resvg.free();
    return png;
  }

  private async loadAsset(code: string, segment: string): Promise<string | FontFace[]> {
    try {
      if (code === 'emoji') {
        const res = await this.fetcher(`${TWEMOJI}/${emojiCode(segment)}.svg`);
        if (!res.ok) return '';
        return `data:image/svg+xml;base64,${toBase64(new Uint8Array(await res.arrayBuffer()))}`;
      }
      return await this.googleFonts(notoFamily(code, segment), segment);
    } catch {
      return code === 'emoji' ? '' : [];
    }
  }

  /** Fetch a subset of a Google Font containing exactly `text`, as TrueType. */
  private async googleFonts(family: string, text: string): Promise<FontFace[]> {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&text=${encodeURIComponent(text)}`;
    // No browser user agent, so Google serves TrueType, which Satori can parse.
    const css = await (await this.fetcher(url)).text();
    const faces: FontFace[] = [];
    for (const block of css.split('@font-face').slice(1)) {
      const src = block.match(/src:\s*url\(([^)]+)\)\s*format\('(opentype|truetype)'\)/)?.[1];
      const weight = Number(block.match(/font-weight:\s*(\d+)/)?.[1] ?? 400);
      if (!src) continue;
      const res = await this.fetcher(src);
      if (!res.ok) continue;
      faces.push({ name: family, data: await res.arrayBuffer(), weight: weight >= 700 ? 700 : 400, style: 'normal' });
    }
    return faces;
  }
}
