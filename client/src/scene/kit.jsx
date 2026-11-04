// Tiện ích dùng chung cho cảnh 3D: vật liệu, texture vẽ bằng canvas, instancing, mái nhà, số ngẫu nhiên cố định.
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Khi true, mọi <Mat> bên trong hiển thị bán trong suốt (bản xem trước lúc đặt đồ).
export const GhostCtx = createContext(false);
// level: độ sáng ban ngày 0.25..1, night: 0 (ngày) .. 1 (đêm).
export const TimeCtx = createContext({ level: 1, night: 0 });
export const useNight = () => useContext(TimeCtx).night;

export function Mat({ color = '#ffffff', rough = 0.78, metal = 0, emissive = '#000000', ei = 0, map = null, flat = false, opacity = 1, transparent = false, side = THREE.FrontSide, toneMapped = true }) {
  const ghost = useContext(GhostCtx);
  return (
    <meshStandardMaterial
      color={color} roughness={rough} metalness={metal} emissive={emissive} emissiveIntensity={ei}
      map={map} flatShading={flat} side={side} toneMapped={toneMapped}
      transparent={ghost || transparent} opacity={ghost ? 0.45 * opacity : opacity} depthWrite={!ghost && !transparent}
    />
  );
}

// PRNG cố định để bố cục thế giới giống nhau ở mọi lần tải.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = n => rng(Math.imul(n | 0, 2654435761) ^ 0x9e3779b9)();
export const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// Trộn màu hex trong không gian sRGB (t=0 → a, t=1 → b).
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [r1, g1, b1] = ch(pa), [r2, g2, b2] = ch(pb);
  const f = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${f(r1, r2)}${f(g1, g2)}${f(b1, b2)}`;
}

const texCache = new Map();
export function canvasTexture(key, w, h, draw, repeat) {
  const k = repeat ? `${key}@${repeat.join('x')}` : key;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  texCache.set(k, t);
  return t;
}

export const stripes = (a, b, n = 8, vertical = true) => canvasTexture(`stripes:${a}:${b}:${n}:${vertical}`, 256, 256, (g, w, h) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    if (vertical) g.fillRect((i * w) / n, 0, w / n + 1, h); else g.fillRect(0, (i * h) / n, w, h / n + 1);
  }
});

export const checker = (a, b, n, repeat) => canvasTexture(`checker:${a}:${b}:${n}`, 256, 256, (g, w) => {
  const s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? b : a; g.fillRect(i * s, j * s, s, s); }
}, repeat);

export const planks = repeat => canvasTexture('planks', 512, 512, (g, w, h) => {
  const rows = 8, r = rng(7);
  for (let i = 0; i < rows; i++) {
    const y = (i * h) / rows, rh = h / rows;
    let x = -r() * 200;
    while (x < w) {
      const len = 180 + r() * 160;
      g.fillStyle = mix('#e2b588', '#cf9a6a', r());
      g.fillRect(x, y, len, rh);
      g.fillStyle = 'rgba(120,70,30,.10)';
      for (let k = 0; k < 3; k++) g.fillRect(x, y + rh * (0.25 + r() * 0.5), len, 1.5);
      g.fillStyle = 'rgba(90,50,20,.35)';
      g.fillRect(x, y, 2, rh);
      x += len;
    }
    g.fillStyle = 'rgba(90,50,20,.35)';
    g.fillRect(0, y, w, 2);
  }
}, repeat);

export const radialGlow = (color = '255,214,150') => canvasTexture(`glow:${color}`, 128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, `rgba(${color},1)`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

export const verticalFade = (color = '255,214,150') => canvasTexture(`vfade:${color}`, 16, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, `rgba(${color},.9)`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

export function signTexture(text, bg = '#3f6f63', fg = '#fff6e6') {
  return canvasTexture(`sign:${text}:${bg}`, 512, 160, (g, w, h) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 40); g.fill();
    g.strokeStyle = fg; g.lineWidth = 6; g.beginPath(); g.roundRect(22, 22, w - 44, h - 44, 28); g.stroke();
    g.fillStyle = fg; g.font = 'bold 76px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

// Mặt tiền tòa nhà: cửa sổ vẽ sẵn (map) + bản đèn sáng ban đêm (emissive).
function drawFacade(g, w, h, color, floors, cols, glow) {
  g.fillStyle = glow ? '#000' : color; g.fillRect(0, 0, w, h);
  const fh = h / floors, r = rng(floors * 31 + color.charCodeAt(2) * 7);
  for (let f = 0; f < floors; f++) {
    const y0 = f * fh;
    if (!glow) {
      g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, y0 + fh - 9, w, 4);
      g.fillStyle = 'rgba(60,30,10,.08)'; g.fillRect(0, y0 + fh - 5, w, 5);
    }
    for (let c = 0; c < cols; c++) {
      const cw = w / cols, ww = cw * 0.52, wh = fh * 0.5, x = c * cw + (cw - ww) / 2, y = y0 + fh * 0.2;
      const lit = r() > 0.4;
      if (glow) { if (lit) { g.fillStyle = '#ffcf7a'; g.fillRect(x, y, ww, wh); } continue; }
      g.fillStyle = '#fffaf2'; g.fillRect(x - 5, y - 5, ww + 10, wh + 10);
      const gr = g.createLinearGradient(0, y, 0, y + wh); gr.addColorStop(0, '#dff3fb'); gr.addColorStop(1, '#8fc2dc');
      g.fillStyle = gr; g.fillRect(x, y, ww, wh);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(x + 4, y + wh * 0.7); g.lineTo(x + ww * 0.45, y + 4); g.lineTo(x + ww * 0.6, y + 4); g.lineTo(x + 4, y + wh * 0.9); g.fill();
      g.fillStyle = '#fffaf2'; g.fillRect(x + ww / 2 - 2, y, 4, wh); g.fillRect(x, y + wh * 0.45, ww, 3);
      g.fillStyle = 'rgba(60,30,10,.15)'; g.fillRect(x - 8, y + wh + 5, ww + 16, 6);
    }
  }
}
export function facade(color, floors, cols = 3) {
  const H = Math.min(1024, Math.round((256 * floors * 2.4) / 8));
  return {
    map: canvasTexture(`fac:${color}:${floors}:${cols}`, 256, H, (g, w, h) => drawFacade(g, w, h, color, floors, cols, false)),
    glow: canvasTexture(`facg:${color}:${floors}:${cols}`, 256, H, (g, w, h) => drawFacade(g, w, h, color, floors, cols, true)),
  };
}

// Nhiều bản sao của một mesh trong 1 draw call. items: [{p:[x,y,z], s: number|[sx,sy,sz], r: rotY, rx, rz, c: màu}]
const tmpObj = new THREE.Object3D(), tmpColor = new THREE.Color();
export function Inst({ items, children, castShadow = true, receiveShadow = true }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      tmpObj.position.set(it.p[0], it.p[1], it.p[2]);
      tmpObj.rotation.set(it.rx || 0, it.r || 0, it.rz || 0);
      const s = it.s ?? 1;
      if (Array.isArray(s)) tmpObj.scale.set(s[0], s[1], s[2]); else tmpObj.scale.setScalar(s);
      tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix);
      if (it.c) m.setColorAt(i, tmpColor.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]} castShadow={castShadow} receiveShadow={receiveShadow}>
      {children}
    </instancedMesh>
  );
}

// Mái hai mái dốc: tam giác hồi (màu tường) + hai tấm mái. Nóc chạy dọc trục X.
export function GableRoof({ len, depth, rise, y, wallColor, roofColor, overhang = 0.55, thick = 0.3 }) {
  const tri = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-depth / 2, 0); s.lineTo(depth / 2, 0); s.lineTo(0, rise); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2);
    return g;
  }, [len, depth, rise]);
  const a = Math.atan2(rise, depth / 2);
  const half = depth / 2 + overhang;
  const slab = half / Math.cos(a);
  const midY = (rise - overhang * Math.tan(a)) / 2 + thick / 2;
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={tri} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow><Mat color={wallColor} /></mesh>
      {[1, -1].map(s => (
        <mesh key={s} position={[0, midY, (s * half) / 2]} rotation={[s * a, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[len + overhang * 2, thick, slab]} />
          <Mat color={roofColor} rough={0.85} />
        </mesh>
      ))}
      <mesh position={[0, rise + thick * 0.6, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, len + overhang * 2 + 0.1, 8]} />
        <Mat color={mix(roofColor, '#000000', 0.18)} />
      </mesh>
    </group>
  );
}

// Nhãn DOM bám theo một điểm 3D. Không dùng React root riêng (tránh lỗi unmount của drei <Html> với React 19).
const projVec = new THREE.Vector3();
export function ScreenLabel({ text, className = '', position = [0, 0, 0] }) {
  const group = useRef();
  const { gl, camera, size } = useThree();
  const el = useMemo(() => document.createElement('div'), []);
  useEffect(() => { el.className = 'screen-label ' + className; el.textContent = text; }, [el, text, className]);
  useEffect(() => {
    const parent = gl.domElement.parentNode;
    parent?.appendChild(el);
    return () => el.remove();
  }, [gl, el]);
  useFrame(() => {
    if (!group.current) return;
    group.current.getWorldPosition(projVec);
    projVec.project(camera);
    const visible = projVec.z < 1 && Math.abs(projVec.x) < 1.2 && Math.abs(projVec.y) < 1.2;
    el.style.display = visible ? '' : 'none';
    if (visible) el.style.transform = `translate(${(projVec.x * 0.5 + 0.5) * size.width}px, ${(-projVec.y * 0.5 + 0.5) * size.height}px) translate(-50%, -100%)`;
  });
  return <group ref={group} position={position} />;
}

// Các khối lớn (nhà, quán) có thể che camera — camera sẽ kéo lại gần khi bị chắn.
export const occluders = new Set();
export function useOccluder() {
  const ref = useRef();
  useEffect(() => {
    const o = ref.current;
    if (!o) return;
    occluders.add(o);
    return () => occluders.delete(o);
  }, []);
  return ref;
}

// Bật/tắt chế độ mờ cho toàn bộ vật liệu trong một khối (lưu lại giá trị gốc để khôi phục).
function setFade(root, on) {
  root.traverse(m => {
    if (!m.isMesh) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => {
      if (on && !mt.userData.fade) {
        mt.userData.fade = { t: mt.transparent, o: mt.opacity, d: mt.depthWrite };
        mt.transparent = true; mt.opacity = 0.18 * mt.opacity; mt.depthWrite = false; mt.needsUpdate = true;
      } else if (!on && mt.userData.fade) {
        const f = mt.userData.fade;
        mt.transparent = f.t; mt.opacity = f.o; mt.depthWrite = f.d; mt.needsUpdate = true;
        delete mt.userData.fade;
      }
    });
  });
}
// Làm mờ mọi vật che (occluders) nằm giữa camera và một điểm (đầu nhân vật).
export function makeFader() {
  const faded = new Set(), ray = new THREE.Raycaster(), dir = new THREE.Vector3();
  return {
    update(camera, head) {
      dir.subVectors(camera.position, head);
      const far = dir.length();
      ray.set(head, dir.normalize());
      ray.far = far;
      const now = new Set();
      for (const h of ray.intersectObjects([...occluders], true)) {
        let o = h.object;
        while (o && !occluders.has(o)) o = o.parent;
        if (o) now.add(o);
      }
      faded.forEach(o => { if (!now.has(o)) { setFade(o, false); faded.delete(o); } });
      now.forEach(o => { if (!faded.has(o)) { setFade(o, true); faded.add(o); } });
    },
    clear() { faded.forEach(o => setFade(o, false)); faded.clear(); },
  };
}
// Chuyển FOV camera mượt (góc nhìn thứ 3 dùng FOV rộng hơn).
export function lerpFov(camera, fov, dt) {
  if (Math.abs(camera.fov - fov) < 0.05) return;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}
