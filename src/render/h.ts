/**
 * A tiny element factory producing the React-element-shaped objects Satori
 * consumes, so the renderer does not need React or a JSX toolchain.
 */

export type Style = Record<string, string | number | undefined>;

export interface SatoriElement {
  type: string;
  key: null;
  props: Record<string, unknown> & { children?: SatoriChild | SatoriChild[]; style?: Style };
}

export type SatoriChild = SatoriElement | string | number | null | undefined | false;

export function h(
  type: string,
  props: (Record<string, unknown> & { style?: Style }) | null,
  ...children: (SatoriChild | SatoriChild[])[]
): SatoriElement {
  const flat = children.flat().filter((c): c is SatoriElement | string | number => c !== null && c !== undefined && c !== false && c !== '');
  const style: Style = { ...(props?.style ?? {}) };
  // Satori requires an explicit display on every div with more than one child.
  if (type === 'div' && style.display === undefined) style.display = 'flex';
  const next: SatoriElement['props'] = { ...(props ?? {}), style };
  if (flat.length === 1) next.children = flat[0];
  else if (flat.length > 1) next.children = flat;
  return { type, key: null, props: next };
}

export const div = (style: Style, ...children: (SatoriChild | SatoriChild[])[]) => h('div', { style }, ...children);
