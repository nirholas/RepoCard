/**
 * Cloudflare Worker entry. Wires the WebAssembly modules and bundled fonts
 * into the render engine and delegates everything else to app.ts.
 */
import { satori } from '@cf-wasm/satori';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { handle } from './app';
import type { Env } from './env';
import { RenderEngine } from './render/engine';
import { FONT_MANIFEST } from './render/fonts';
import type { CacheLike } from './service';
import bricolageGrotesque800 from './render/font-files/bricolage-grotesque-latin-800-normal.woff';
import instrumentSerif400 from './render/font-files/instrument-serif-latin-400-normal.woff';
import instrumentSerif400Italic from './render/font-files/instrument-serif-latin-400-italic.woff';
import inter400 from './render/font-files/inter-latin-400-normal.woff';
import inter500 from './render/font-files/inter-latin-500-normal.woff';
import inter700 from './render/font-files/inter-latin-700-normal.woff';
import inter800 from './render/font-files/inter-latin-800-normal.woff';
import jetbrainsMono400 from './render/font-files/jetbrains-mono-latin-400-normal.woff';
import jetbrainsMono700 from './render/font-files/jetbrains-mono-latin-700-normal.woff';
import sora700 from './render/font-files/sora-latin-700-normal.woff';
import spaceGrotesk700 from './render/font-files/space-grotesk-latin-700-normal.woff';

const FONT_DATA: Record<string, ArrayBuffer> = {
  'inter-latin-400-normal.woff': inter400,
  'inter-latin-500-normal.woff': inter500,
  'inter-latin-700-normal.woff': inter700,
  'inter-latin-800-normal.woff': inter800,
  'space-grotesk-latin-700-normal.woff': spaceGrotesk700,
  'jetbrains-mono-latin-400-normal.woff': jetbrainsMono400,
  'jetbrains-mono-latin-700-normal.woff': jetbrainsMono700,
  'instrument-serif-latin-400-normal.woff': instrumentSerif400,
  'instrument-serif-latin-400-italic.woff': instrumentSerif400Italic,
  'sora-latin-700-normal.woff': sora700,
  'bricolage-grotesque-latin-800-normal.woff': bricolageGrotesque800,
};

// Created at module scope so WebAssembly initialization belongs to the isolate,
// not to the first request (Workers cannot settle a request's promises after it ends).
const engine = new RenderEngine({
  satori: satori as never,
  resvg: resvgWasm,
  fonts: FONT_MANIFEST.map((f) => {
    const data = FONT_DATA[f.file];
    if (!data) throw new Error(`Font ${f.file} is not bundled`);
    return { name: f.name, weight: f.weight, style: f.style, data };
  }),
  // Emoji and non-Latin font subsets are immutable; let Cloudflare cache them.
  fetcher: (input, init) => fetch(input, { ...init, cf: { cacheTtl: 60 * 60 * 24 * 30, cacheEverything: true } } as RequestInit),
});
engine.warm().catch((err: unknown) => console.error(JSON.stringify({ event: 'engine_init_failed', message: String(err) })));

const noCache: CacheLike = { match: async () => undefined, put: async () => undefined };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cache: CacheLike = typeof caches !== 'undefined' ? (caches as unknown as { default: CacheLike }).default : noCache;
    return handle(request, env, ctx, { renderer: engine, cache });
  },
} satisfies ExportedHandler<Env>;
