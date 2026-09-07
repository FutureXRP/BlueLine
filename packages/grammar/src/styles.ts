/**
 * Style packs (bible §4.4): style is separate from plan type. A pack sets
 * roof form/pitch, ceilings, window proportions, palette. Values feed the
 * engine spec and opening requests — never sheet text directly.
 */

export interface StylePack {
  id: 'modern_farmhouse' | 'craftsman' | 'modern';
  label: string;
  roofStyle: 'gable' | 'hip';
  roofPitch: number; // rise per 12
  overhangIn: number;
  /** which elevation sides read as gable ends for the roof field */
  gableSides: Array<'front' | 'rear' | 'left' | 'right'>;
  window: { w: number; h: number; sill: number };
  windowSmall: { w: number; h: number; sill: number };
  entryDoorIn: number;
  palette: { siding: string; trim: string; roof: string; accent: string };
}

export const STYLE_PACKS: Record<StylePack['id'], StylePack> = {
  modern_farmhouse: {
    id: 'modern_farmhouse',
    label: 'Modern Farmhouse',
    roofStyle: 'gable',
    roofPitch: 8,
    overhangIn: 18,
    gableSides: ['left', 'right'],
    window: { w: 36, h: 60, sill: 24 },
    windowSmall: { w: 24, h: 36, sill: 48 },
    entryDoorIn: 36,
    palette: { siding: '#F4F1E8', trim: '#23272B', roof: '#3A3F45', accent: '#173FA8' },
  },
  craftsman: {
    id: 'craftsman',
    label: 'Craftsman',
    roofStyle: 'gable',
    roofPitch: 6,
    overhangIn: 24,
    gableSides: ['left', 'right'],
    window: { w: 36, h: 54, sill: 30 },
    windowSmall: { w: 24, h: 36, sill: 48 },
    entryDoorIn: 36,
    palette: { siding: '#8B9A7D', trim: '#EDE7D6', roof: '#4A4238', accent: '#7A4A2B' },
  },
  modern: {
    id: 'modern',
    label: 'Modern',
    roofStyle: 'hip',
    roofPitch: 4,
    overhangIn: 24,
    gableSides: [],
    window: { w: 48, h: 60, sill: 24 },
    windowSmall: { w: 30, h: 30, sill: 54 },
    entryDoorIn: 42,
    palette: { siding: '#DFDCD4', trim: '#23272B', roof: '#2A2E33', accent: '#0B2E63' },
  },
};
