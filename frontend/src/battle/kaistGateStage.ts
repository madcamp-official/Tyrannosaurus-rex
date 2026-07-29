/**
 * KAIST 정문 사격 배경을 실제 3D 지오메트리로 구성해 낮/노을 두 장의 정지 이미지로 굽는다.
 * 카메라가 고정된 한 구도만 필요하므로("이만큼만 보이면 돼"), 매 프레임 렌더링 대신
 * 오프스크린 WebGL에서 두 조명 프리셋으로 한 번씩만 렌더링하고 데이터 URL로 옮긴 뒤
 * 컨텍스트를 즉시 반환한다(Retrogun 정적 렌더링과 동일한 패턴).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const STAGE_W = 1920;
const STAGE_H = 1080;

export interface KaistGateBackdrop {
  day: string;
  sunset: string;
}

let cached: Promise<KaistGateBackdrop> | null = null;

export function getKaistGateBackdrops(): Promise<KaistGateBackdrop> {
  if (!cached) cached = Promise.resolve().then(buildKaistGateBackdrops);
  return cached;
}

type Variant = "day" | "sunset";

function texCanvas(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSkyTexture(variant: Variant): THREE.CanvasTexture {
  return texCanvas(512, 1024, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (variant === "day") {
      grad.addColorStop(0, "#3f6fae");
      grad.addColorStop(0.45, "#7fa8d4");
      grad.addColorStop(0.78, "#bfd6e9");
      grad.addColorStop(1, "#e4ecf1");
    } else {
      grad.addColorStop(0, "#0d1636");
      grad.addColorStop(0.3, "#2a3567");
      grad.addColorStop(0.52, "#7a5c80");
      grad.addColorStop(0.7, "#d97a5c");
      grad.addColorStop(0.85, "#f3a35f");
      grad.addColorStop(1, "#f8cf94");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const glowY = variant === "day" ? h * 0.26 : h * 0.76;
    const glowX = w * 0.66;
    const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, w * 0.34);
    if (variant === "day") {
      glow.addColorStop(0, "rgba(255,251,238,0.85)");
      glow.addColorStop(0.4, "rgba(255,251,238,0.2)");
    } else {
      glow.addColorStop(0, "rgba(255,221,165,0.95)");
      glow.addColorStop(0.4, "rgba(255,170,110,0.35)");
    }
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const cloudCount = variant === "day" ? 6 : 8;
    ctx.filter = "blur(10px)";
    for (let i = 0; i < cloudCount; i += 1) {
      const cx = (i * 97 + 40) % w;
      const cy = h * (0.1 + ((i * 53) % 100) / 100) * 0.32;
      const cw = 80 + (i % 3) * 46;
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p += 1) {
        const px = cx + (p - puffs / 2) * cw * 0.32;
        const py = cy + Math.sin(p * 1.7) * cw * 0.06;
        const pr = cw * (0.5 + (p % 2) * 0.18);
        const glow = ctx.createRadialGradient(px, py, 0, px, py, pr);
        const color = variant === "day" ? "255,255,255" : "255,205,190";
        glow.addColorStop(0, `rgba(${color},${variant === "day" ? 0.34 : 0.3})`);
        glow.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.filter = "none";

    if (variant === "sunset") {
      for (let i = 0; i < 60; i += 1) {
        const sx = (i * 131 + 17) % w;
        const sy = h * (((i * 71) % 100) / 100) * 0.22;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + ((i * 37) % 50) / 100})`;
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
    }
  });
}

function makeStoneTexture(): THREE.CanvasTexture {
  const texture = texCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#d8cdb8";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i += 1) {
      const shade = 190 + Math.floor(((i * 37) % 40) - 20);
      ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 18},0.5)`;
      const x = (i * 53) % w;
      const y = (i * 91) % h;
      ctx.fillRect(x, y, 2 + (i % 3), 1 + (i % 2));
    }
    ctx.strokeStyle = "rgba(120,110,92,0.35)";
    ctx.lineWidth = 2;
    for (let row = 0; row < 6; row += 1) {
      const y = (row / 6) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 3);
  return texture;
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  const texture = texCanvas(256, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#232322";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i += 1) {
      const shade = 30 + (i % 22);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},0.5)`;
      ctx.fillRect((i * 71) % w, (i * 113) % h, 1, 1);
    }
    // 중앙 차선
    ctx.strokeStyle = "rgba(235,205,90,0.85)";
    ctx.lineWidth = 6;
    ctx.setLineDash([34, 26]);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(w * 0.5, h);
    ctx.stroke();
    // 우측 연석 라인
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(230,225,210,0.65)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w * 0.86, 0);
    ctx.lineTo(w * 0.86, h);
    ctx.stroke();
  });
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

function makeBuildingTexture(variant: Variant): THREE.CanvasTexture {
  return texCanvas(256, 384, (ctx, w, h) => {
    ctx.fillStyle = variant === "day" ? "#9aa5b0" : "#3d4557";
    ctx.fillRect(0, 0, w, h);
    const cols = 10;
    const rows = 16;
    const cellW = w / cols;
    const cellH = h / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = variant === "sunset" ? (r * 7 + c * 3) % 5 !== 0 : (r * 7 + c * 3) % 4 === 0;
        ctx.fillStyle = lit
          ? variant === "sunset"
            ? "rgba(255,205,130,0.8)"
            : "rgba(205,222,235,0.55)"
          : "rgba(28,31,38,0.6)";
        ctx.fillRect(c * cellW + 2, r * cellH + 2, cellW - 4, cellH - 4);
      }
    }
    // 옥상 코핑
    ctx.fillStyle = "rgba(15,17,22,0.55)";
    ctx.fillRect(0, 0, w, h * 0.02);
    // 저층부(출입구 라인)를 살짝 어둡게
    ctx.fillStyle = "rgba(10,11,14,0.28)";
    ctx.fillRect(0, h * 0.94, w, h * 0.06);
  });
}

function makeSignTexture(): THREE.CanvasTexture {
  return texCanvas(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#eae3d3";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#0a3a8c";
    ctx.font = "bold 64px 'Arial Black', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("KAIST", 28, h * 0.55);
    ctx.fillStyle = "#0a3a8c";
    ctx.fillRect(28, h * 0.78, 220, 6);
  });
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const texture = texCanvas(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "rgba(0,0,0,0.5)");
    gradient.addColorStop(0.65, "rgba(0,0,0,0.22)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  return texture;
}

function makeTree(scale: number): THREE.Group {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, 1.1 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x2c211a, roughness: 1 }),
  );
  trunk.position.y = 0.55 * scale;
  tree.add(trunk);
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2a1a, roughness: 0.95 });
  for (let i = 0; i < 3; i += 1) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry((1.1 - i * 0.22) * scale, 1.5 * scale, 8), foliageMaterial);
    cone.position.y = (1.1 + i * 0.85) * scale;
    tree.add(cone);
  }
  return tree;
}

// 로우폴리 나무 에셋(6종, CC-BY-4.0 "Low Poly Trees - Free Asset Pack" by PeToDes — 출처는
// frontend/public/models/low_poly_trees/LICENSE.txt 참고). 원본이 가장 큰 나무의 높이를
// 기준으로 전체를 같은 배율로 줄여서, 6종 사이의 상대적 크기 차이(큰 소나무 vs 낮은 관목)는
// 그대로 유지한다.
const TREE_MODEL_URL = "/models/low_poly_trees/scene.gltf";
const TREE_REFERENCE_HEIGHT = 3.55;

interface TreeTemplates {
  geometries: THREE.BufferGeometry[];
  material: THREE.Material;
}

function normalizeTreeGeometry(source: THREE.BufferGeometry): { geometry: THREE.BufferGeometry; height: number } {
  const geometry = source.clone();
  geometry.computeBoundingBox();
  let box = geometry.boundingBox!;
  let size = box.getSize(new THREE.Vector3());
  // 원본이 Z가 최장축(블렌더/스케치팹 Z-up 관례)이면 Y-up으로 세운다.
  if (size.z > size.y * 1.3) {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    geometry.computeBoundingBox();
    box = geometry.boundingBox!;
    size = box.getSize(new THREE.Vector3());
  }
  const center = box.getCenter(new THREE.Vector3());
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  return { geometry, height: size.y };
}

async function loadTreeTemplates(): Promise<TreeTemplates | null> {
  try {
    const gltf = await new Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF>((resolve, reject) => {
      new GLTFLoader().load(TREE_MODEL_URL, resolve, undefined, reject);
    });
    const rawMeshes: THREE.Mesh[] = [];
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) rawMeshes.push(child);
    });
    if (rawMeshes.length === 0) return null;

    const normalized = rawMeshes.map((mesh) => normalizeTreeGeometry(mesh.geometry));
    const maxHeight = Math.max(...normalized.map((n) => n.height));
    const unitScale = maxHeight > 0 ? TREE_REFERENCE_HEIGHT / maxHeight : 1;
    const scaleMatrix = new THREE.Matrix4().makeScale(unitScale, unitScale, unitScale);
    const geometries = normalized.map(({ geometry }) => {
      geometry.applyMatrix4(scaleMatrix);
      return geometry;
    });

    const material = rawMeshes[0]!.material as THREE.Material;
    if ("roughness" in material) (material as THREE.MeshStandardMaterial).roughness = 1;
    if ("metalness" in material) (material as THREE.MeshStandardMaterial).metalness = 0;

    return { geometries, material };
  } catch (error) {
    console.warn("로우폴리 나무 모델을 불러오지 못해 절차적 나무로 대체합니다.", error);
    return null;
  }
}

function makeTreeMesh(templates: TreeTemplates, variantIndex: number, scale: number): THREE.Mesh {
  const geometry = templates.geometries[variantIndex % templates.geometries.length]!;
  const mesh = new THREE.Mesh(geometry, templates.material);
  mesh.scale.setScalar(scale);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  return mesh;
}

function makeLamp(): THREE.Group {
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 3.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6, metalness: 0.3 }),
  );
  pole.position.y = 1.6;
  lamp.add(pole);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb85c, emissiveIntensity: 2.2, roughness: 0.4 }),
  );
  head.position.y = 3.25;
  lamp.add(head);
  return lamp;
}

// 실제 KAIST 정문 사진 기준 — 가운데가 뚫린 "H" 프레임이 아니라, 세장형 석재 모놀리스
// 하나에 도로 중심 쪽으로 살짝 꺾인 보조 매스가 붙어 세로 그림자 줄눈을 만드는 형태다.
// 꼭대기에는 짙은 색 얇은 마감 캡이 있다. 좌우 두 기둥은 완전히 동일한 치수로 만들고
// foldSide로만 꺾임 방향을 반전해, 서로 마주보는 대칭 쌍이 되게 한다.
function buildGatePillar({
  height,
  width,
  depth,
  foldSide,
}: {
  height: number;
  width: number;
  depth: number;
  foldSide: 1 | -1;
}): THREE.Group {
  const stone = makeStoneTexture();
  const material = new THREE.MeshStandardMaterial({ map: stone, color: 0xe9e1cc, roughness: 0.88, metalness: 0.02 });
  const capMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2a26, roughness: 0.55, metalness: 0.25 });
  const group = new THREE.Group();

  const main = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  main.position.set(0, height / 2, 0);
  group.add(main);

  const fold = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, height, depth * 0.92), material);
  fold.position.set(foldSide * (width * 0.5 + 0.05), height / 2, -depth * 0.16);
  fold.rotation.y = foldSide * THREE.MathUtils.degToRad(13);
  group.add(fold);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(width * 1.55, 0.32, depth * 1.35), capMaterial);
  cap.position.set(foldSide * width * 0.16, height + 0.16, 0);
  group.add(cap);

  return group;
}

function buildScene(treeTemplates: TreeTemplates | null): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  buildingMaterial: THREE.MeshStandardMaterial;
  lampGlows: THREE.PointLight[];
  bg: { day: THREE.CanvasTexture; sunset: THREE.CanvasTexture };
  dispose: () => void;
} {
  const scene = new THREE.Scene();
  // 실제 사진처럼 도로 중앙에서 정면으로 바라보는 좌우 대칭 구도.
  const camera = new THREE.PerspectiveCamera(52, STAGE_W / STAGE_H, 0.1, 200);
  camera.position.set(0, 1.7, 15);
  camera.lookAt(0, 5.5, -22);

  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x1a1410, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-6, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 55;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, -15);
  scene.add(sun, sun.target);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const contactShadowTexture = track(makeContactShadowTexture());
  const addContactShadow = (x: number, z: number, radius: number, opacity = 1): void => {
    const mat = track(
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.renderOrder = 1;
    mesh.userData.isDecal = true;
    scene.add(mesh);
  };

  // 도로 — 카메라가 중앙에 있으므로 도로도 x=0을 기준으로 대칭이다.
  const asphalt = track(makeAsphaltTexture());
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 90),
    track(new THREE.MeshStandardMaterial({ map: asphalt, roughness: 1 })),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -20);
  scene.add(road);

  // 양쪽 보도 — 정문 사진처럼 좌우 모두에 보도가 있다.
  const sidewalkMaterial = track(new THREE.MeshStandardMaterial({ color: 0xb9ada0, roughness: 1 }));
  for (const side of [-1, 1] as const) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(9, 90), sidewalkMaterial);
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(side * 20, 0.01, -20);
    scene.add(sidewalk);
  }

  // 배경 건물 — 사진 속 KAIST 정문 뒤 건물처럼 높이가 다른 여러 매스가 이어붙은 형태로 구성한다.
  // 단일 평평한 박스 하나로는 판자처럼 보여서, 낮은 앞 동 + 넓은 본동 + 뒤쪽의 좁고 높은 동으로
  // 나누고 전체를 살짝 비틀어 배치했다(정면과 평행하지 않게 — 사진에서도 건물이 살짝 사선으로 보인다).
  const buildingTexture = track(makeBuildingTexture("day"));
  const buildingMaterial = track(
    new THREE.MeshStandardMaterial({ map: buildingTexture, color: 0xffffff, roughness: 0.9, emissive: 0x000000, emissiveMap: buildingTexture, emissiveIntensity: 0 }),
  );
  const trimMaterial = track(new THREE.MeshStandardMaterial({ color: 0xcdc6b8, roughness: 0.85, metalness: 0.05 }));

  const addVolume = (
    parent: THREE.Object3D,
    width: number,
    height: number,
    depth: number,
    x: number,
    z: number,
  ): void => {
    const volume = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), buildingMaterial);
    volume.position.set(x, height / 2, z);
    parent.add(volume);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.35, depth + 0.5), trimMaterial);
    cap.position.set(x, height + 0.18, z);
    parent.add(cap);
  };

  const buildingGroup = new THREE.Group();
  addVolume(buildingGroup, 26, 11.5, 9, -15, -2); // 낮고 넓은 앞 동
  addVolume(buildingGroup, 24, 15, 9, 6, 0); // 중앙 본동
  addVolume(buildingGroup, 11, 19, 8, 18, -3); // 뒤쪽의 좁고 높은 동
  buildingGroup.position.set(0, 0, -46);
  buildingGroup.rotation.y = THREE.MathUtils.degToRad(9);
  scene.add(buildingGroup);

  // 좌우 정문 기둥 — 완전히 같은 치수로, 도로 중심을 기준으로 서로 마주보게 대칭 배치한다.
  const PILLAR_X = 11;
  const PILLAR_Z = -9;
  const pillarDims = { height: 10.5, width: 2.3, depth: 2 };

  const leftPillar = buildGatePillar({ ...pillarDims, foldSide: 1 });
  leftPillar.position.set(-PILLAR_X, 0, PILLAR_Z);
  scene.add(leftPillar);
  addContactShadow(-PILLAR_X, PILLAR_Z + 0.4, 3.2, 0.9);

  const rightPillar = buildGatePillar({ ...pillarDims, foldSide: -1 });
  rightPillar.position.set(PILLAR_X, 0, PILLAR_Z);
  scene.add(rightPillar);
  addContactShadow(PILLAR_X, PILLAR_Z + 0.4, 3.2, 0.9);

  // 도로 중앙 화단 섬 — KAIST 사인 + 낮은 담장 + 노란 꽃 토피어리. 기둥보다 카메라 쪽에 가깝게 둔다.
  const signTexture = track(makeSignTexture());
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(6.5, 1.5, 0.5),
    track(new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.8 })),
  );
  wall.position.set(0, 0.75, -2.4);
  scene.add(wall);
  addContactShadow(0, -0.2, 3.6, 0.6);
  const signPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 0.9),
    track(new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.6 })),
  );
  signPlane.position.set(0, 0.95, -2.14);
  scene.add(signPlane);

  // 화단(낮은 초록 덤불 + 노란 꽃 포인트) — 사인 앞에 중앙 정렬로 배치.
  for (let i = 0; i < 7; i += 1) {
    const isFlower = i % 3 === 1;
    const bush = new THREE.Mesh(
      new THREE.SphereGeometry(isFlower ? 0.22 : 0.42, 8, 8),
      track(new THREE.MeshStandardMaterial({ color: isFlower ? 0xd9b23c : 0x33502a, roughness: 1 })),
    );
    bush.position.set(-2.55 + i * 0.85, isFlower ? 0.42 : 0.32, -0.6 + (i % 2) * 0.15);
    bush.scale.y = 0.62;
    scene.add(bush);
  }
  addContactShadow(0, -0.6, 3.4, 0.5);

  // 나무 군락
  const treeSpots: Array<[number, number, number]> = [
    [-15, -14, 1.3], [-13, -22, 1.6], [-18, -30, 1.9], [-6, -18, 1.1],
    [15, -8, 1.4], [17.5, -18, 1.8], [14, -26, 1.5], [21, -30, 2.0],
    [-20, -40, 2.2], [12, -40, 2.1], [3, -34, 1.6],
  ];
  treeSpots.forEach(([x, z, s], i) => {
    const tree = treeTemplates ? makeTreeMesh(treeTemplates, i, s) : makeTree(s);
    tree.position.set(x, 0, z);
    scene.add(tree);
    addContactShadow(x, z, 0.9 * s, 0.55);
  });

  // 가로등 — 양쪽 보도에 대칭으로.
  const lampZSpots = [6, -6, -16];
  const lampGlows: THREE.PointLight[] = [];
  for (const side of [-1, 1] as const) {
    for (const z of lampZSpots) {
      const x = side * 14;
      const lamp = makeLamp();
      lamp.position.set(x, 0, z);
      scene.add(lamp);
      const glow = new THREE.PointLight(0xffb35c, 0, 4.5, 2);
      glow.position.set(x, 3.2, z);
      scene.add(glow);
      lampGlows.push(glow);
      addContactShadow(x, z, 0.5, 0.4);
    }
  }

  // 보도 볼라드 등 — 양쪽 보도에 대칭으로.
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 5; i += 1) {
      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 0.5, 8),
        track(new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb35c, emissiveIntensity: 1.4, roughness: 0.5 })),
      );
      bollard.position.set(side * 18.5, 0.25, 8 - i * 6);
      scene.add(bollard);
    }
  }

  const bg = { day: track(makeSkyTexture("day")), sunset: track(makeSkyTexture("sunset")) };

  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.userData.isDecal) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return {
    scene,
    camera,
    sun,
    hemi,
    buildingMaterial,
    lampGlows,
    bg,
    dispose: () => {
      disposables.forEach((item) => item.dispose());
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
    },
  };
}

function applyVariant(
  variant: Variant,
  refs: ReturnType<typeof buildScene>,
): { dayTexture: THREE.CanvasTexture; sunsetTexture: THREE.CanvasTexture } {
  const { scene, sun, hemi, buildingMaterial, lampGlows, bg } = refs;
  scene.background = variant === "day" ? bg.day : bg.sunset;
  scene.fog = new THREE.Fog(variant === "day" ? 0xbcd3e8 : 0xc98a6b, 22, 70);

  if (variant === "day") {
    sun.color.set(0xfff2df);
    sun.intensity = 2.3;
    sun.position.set(-5, 11, 7);
    hemi.color.set(0xdfeaff);
    hemi.groundColor.set(0x35302a);
    hemi.intensity = 1.3;
    buildingMaterial.emissiveIntensity = 0.12;
    lampGlows.forEach((glow) => (glow.intensity = 0));
  } else {
    sun.color.set(0xff9a5c);
    sun.intensity = 1.3;
    sun.position.set(-9, 3.2, 4);
    hemi.color.set(0xffb489);
    hemi.groundColor.set(0x140f10);
    hemi.intensity = 0.75;
    buildingMaterial.emissiveIntensity = 0.85;
    lampGlows.forEach((glow) => (glow.intensity = 2.4));
  }

  const previousMap = buildingMaterial.map;
  const buildingTexture = makeBuildingTexture(variant);
  buildingMaterial.map = buildingTexture;
  buildingMaterial.emissiveMap = buildingTexture;
  buildingMaterial.needsUpdate = true;
  previousMap?.dispose();
  return { dayTexture: bg.day, sunsetTexture: bg.sunset };
}

// 어차피 한 번만 굽는 정지 이미지라, 실제 출력보다 2배 큰 해상도로 렌더링한 뒤
// 축소해서 안티앨리어싱 품질을 높인다(슈퍼샘플링). 런타임 비용은 없다.
const SUPERSAMPLE = 2;

async function buildKaistGateBackdrops(): Promise<KaistGateBackdrop> {
  const treeTemplates = await loadTreeTemplates();

  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = STAGE_W * SUPERSAMPLE;
  renderCanvas.height = STAGE_H * SUPERSAMPLE;
  const renderer = new THREE.WebGLRenderer({
    canvas: renderCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(renderCanvas.width, renderCanvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = STAGE_W;
  outputCanvas.height = STAGE_H;
  const outputCtx = outputCanvas.getContext("2d")!;
  outputCtx.imageSmoothingEnabled = true;
  outputCtx.imageSmoothingQuality = "high";

  const refs = buildScene(treeTemplates);

  const renderVariant = (variant: Variant): string => {
    applyVariant(variant, refs);
    renderer.render(refs.scene, refs.camera);
    outputCtx.clearRect(0, 0, STAGE_W, STAGE_H);
    outputCtx.drawImage(renderCanvas, 0, 0, STAGE_W, STAGE_H);
    return outputCanvas.toDataURL("image/jpeg", 0.92);
  };

  const day = renderVariant("day");
  const sunset = renderVariant("sunset");

  refs.buildingMaterial.map?.dispose();
  refs.dispose();
  renderer.dispose();

  return { day, sunset };
}
