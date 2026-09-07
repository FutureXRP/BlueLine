/** Browser demo bundle: the real v2 grammar + engine, no server. */
import { design, fallbackDesigner, buildDesignerSystemPrompt } from '../packages/grammar/src/designer.js';
import { instantiate } from '../packages/grammar/src/instantiate.js';
import { renderLevelSvg, renderElevationSvg } from '../packages/engine/src/render-svg2/index.js';
import { renderDxf2 } from '../packages/engine/src/render-sheet2/dxf.js';
import { stableHash } from '../packages/engine/src/house/hash.js';

(globalThis as Record<string, unknown>)['BluelineV2'] = {
  design, fallbackDesigner, instantiate, renderLevelSvg, renderElevationSvg, renderDxf2, buildDesignerSystemPrompt, stableHash,
};
