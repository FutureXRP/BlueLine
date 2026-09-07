'use client';

/**
 * Three.js viewer from HouseModel (bible §9.1, v0). Wall geometry uses the
 * split-box decomposition adopted from the ChatGPT reference (walls minus
 * openings, sill + head pieces); roof is the sampled height field — the same
 * field the elevations use (Law 5: one model, many outputs).
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Level {
  index: number;
  floorToCeilingIn: number;
  footprint: Array<{ x: number; y: number; w: number; h: number }>;
  walls: Array<{ id: string; x1: number; y1: number; x2: number; y2: number; thickness: number; exterior: boolean }>;
  openings: Array<{ wallId: string; offset: number; width: number; height: number; sill: number; type: string }>;
}

export interface ViewerModel {
  spec: { floorToFloorIn: number; style: string; roofPitch: number };
  levels: Level[];
  extras: Array<{ rect: { x: number; y: number; w: number; h: number } }>;
  roof: { style: string; pitch: number; overhangIn: number };
}

const PALETTES: Record<string, { siding: number; roof: number; trim: number }> = {
  modern_farmhouse: { siding: 0xf4f1e8, roof: 0x3a3f45, trim: 0x23272b },
  craftsman: { siding: 0x8b9a7d, roof: 0x4a4238, trim: 0xede7d6 },
  modern: { siding: 0xdfdcd4, roof: 0x2a2e33, trim: 0x23272b },
};

export default function Viewer3D({ model }: { model: ViewerModel }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const palette = PALETTES[model.spec.style] ?? PALETTES['modern_farmhouse']!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdde3ea);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const l1 = model.levels[0]!;
    const minX = Math.min(...l1.footprint.map((r) => r.x));
    const maxX = Math.max(...l1.footprint.map((r) => r.x + r.w));
    const minY = Math.min(...l1.footprint.map((r) => r.y));
    const maxY = Math.max(...l1.footprint.map((r) => r.y + r.h));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 1, 20000);
    camera.position.set(cx - 700, 520, maxY + 820);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 90, cy);

    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-600, 900, 700);
    sun.castShadow = true;
    sun.shadow.camera.left = -1200; sun.shadow.camera.right = 1200;
    sun.shadow.camera.top = 1200; sun.shadow.camera.bottom = -1200;
    scene.add(sun, new THREE.AmbientLight(0xffffff, 0.75));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x9fae94 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -6.5, cy);
    ground.receiveShadow = true;
    scene.add(ground);

    const sidingMat = new THREE.MeshStandardMaterial({ color: palette.siding, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: palette.roof, roughness: 0.7 });
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.95 });
    const box = (cxi: number, cyi: number, czi: number, dx: number, dy: number, dz: number, mat: THREE.Material) => {
      // model: x east, y toward rear, z up → three: x, z=y(model), y=z(model)
      const m = new THREE.Mesh(new THREE.BoxGeometry(dx, dz, dy), mat);
      m.position.set(cxi, czi, cyi);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    };

    // slabs + porches
    for (const level of model.levels) {
      const zBase = level.index === 0 ? -6 : model.spec.floorToFloorIn - 6;
      for (const r of level.footprint) {
        box(r.x + r.w / 2, r.y + r.h / 2, zBase + 3, r.w, r.h, 6, slabMat);
      }
    }
    for (const e of model.extras) {
      box(e.rect.x + e.rect.w / 2, e.rect.y + e.rect.h / 2, -2, e.rect.w, e.rect.h, 4, slabMat);
    }

    // walls with openings punched (split boxes: reference-adopted)
    for (const level of model.levels) {
      const zFloor = level.index === 0 ? 0 : model.spec.floorToFloorIn;
      const H = level.floorToCeilingIn;
      for (const w of level.walls) {
        const len = Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
        const vertical = w.x1 === w.x2;
        const ops = level.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset);
        const cuts = [0, ...ops.flatMap((o) => [o.offset - o.width / 2, o.offset + o.width / 2]), len];
        for (let i = 0; i < cuts.length - 1; i++) {
          const a = cuts[i]!;
          const b2 = cuts[i + 1]!;
          if (b2 <= a) continue;
          const mid = (a + b2) / 2;
          const o = ops.find((o2) => mid > o2.offset - o2.width / 2 && mid < o2.offset + o2.width / 2);
          const segLen = b2 - a;
          const px = vertical ? w.x1 : Math.min(w.x1, w.x2) + (a + b2) / 2;
          const py = vertical ? Math.min(w.y1, w.y2) + (a + b2) / 2 : w.y1;
          const dx = vertical ? w.thickness : segLen;
          const dy = vertical ? segLen : w.thickness;
          if (!o) {
            box(px, py, zFloor + H / 2, dx, dy, H, sidingMat);
          } else {
            if (o.sill > 0) box(px, py, zFloor + o.sill / 2, dx, dy, o.sill, sidingMat);
            const top = o.sill + o.height;
            if (top < H) box(px, py, zFloor + top + (H - top) / 2, dx, dy, H - top, sidingMat);
          }
        }
      }
      // band joist between levels
      if (level.index === 0 && model.levels.length > 1) {
        const l2 = model.levels[1]!;
        for (const r of l2.footprint) {
          box(r.x + r.w / 2, r.y + r.h / 2, level.floorToCeilingIn + (model.spec.floorToFloorIn - level.floorToCeilingIn) / 2, r.w, r.h, model.spec.floorToFloorIn - level.floorToCeilingIn, sidingMat);
        }
      }
    }

    // roof height-field meshes per level footprint
    const gableSides = model.spec.style === 'modern' ? [] : ['left', 'right'];
    const addRoof = (fp: Level['footprint'], zBase: number) => {
      const oh = model.roof.overhangIn;
      const b0 = {
        minX: Math.min(...fp.map((r) => r.x)) - oh,
        maxX: Math.max(...fp.map((r) => r.x + r.w)) + oh,
        minY: Math.min(...fp.map((r) => r.y)) - oh,
        maxY: Math.max(...fp.map((r) => r.y + r.h)) + oh,
      };
      const inside = (x: number, y: number) =>
        fp.some((r) => x >= r.x - oh && x <= r.x + r.w + oh && y >= r.y - oh && y <= r.y + r.h + oh);
      const dist = (x: number, y: number) => {
        // distance to eave rectangle edges, excluding gable sides
        let d = Infinity;
        for (const r of fp) {
          const ex0 = r.x - oh, ex1 = r.x + r.w + oh, ey0 = r.y - oh, ey1 = r.y + r.h + oh;
          if (!gableSides.includes('front')) d = Math.min(d, Math.abs(y - ey0));
          if (!gableSides.includes('rear')) d = Math.min(d, Math.abs(y - ey1));
          if (!gableSides.includes('left')) d = Math.min(d, Math.abs(x - ex0));
          if (!gableSides.includes('right')) d = Math.min(d, Math.abs(x - ex1));
        }
        return d === Infinity ? 0 : d;
      };
      const step = 12;
      const nx = Math.ceil((b0.maxX - b0.minX) / step) + 1;
      const ny = Math.ceil((b0.maxY - b0.minY) / step) + 1;
      const verts: number[] = [];
      const idx: number[] = [];
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const gx = b0.minX + Math.min(ix * step, b0.maxX - b0.minX);
          const gy = b0.minY + Math.min(iy * step, b0.maxY - b0.minY);
          const h = inside(gx, gy) ? (dist(gx, gy) * model.roof.pitch) / 12 : 0;
          verts.push(gx, zBase + h, gy); // world: x, y=up, z=model y
        }
      }
      for (let iy = 0; iy < ny - 1; iy++) {
        for (let ix = 0; ix < nx - 1; ix++) {
          const a = iy * nx + ix;
          idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: palette.roof, roughness: 0.7, side: THREE.DoubleSide }));
      mesh.castShadow = true;
      scene.add(mesh);
    };
    addRoof(l1.footprint, l1.floorToCeilingIn);
    if (model.levels[1]) {
      addRoof(model.levels[1].footprint, model.spec.floorToFloorIn + model.levels[1].floorToCeilingIn);
    }

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    const onResize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [model]);

  return <div ref={hostRef} style={{ width: '100%', height: 520, border: '1px solid var(--graphite)' }} />;
}
