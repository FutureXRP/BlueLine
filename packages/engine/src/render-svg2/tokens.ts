/** Style render tokens mirrored from the grammar's style packs (engine must
 *  not depend on grammar — the ids are the contract). */
export const STYLE_TOKENS: Record<
  string,
  { siding: string; roof: string; gableSides: Array<'front' | 'rear' | 'left' | 'right'> }
> = {
  modern_farmhouse: { siding: '#F4F1E8', roof: '#3A3F45', gableSides: ['left', 'right'] },
  craftsman: { siding: '#8B9A7D', roof: '#4A4238', gableSides: ['left', 'right'] },
  modern: { siding: '#DFDCD4', roof: '#2A2E33', gableSides: [] },
};
