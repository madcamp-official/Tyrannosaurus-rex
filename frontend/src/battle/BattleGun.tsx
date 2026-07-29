/** 화면 하단 귀퉁이 레이건. 평시엔 무채색에 가깝고, 발사·명중 순간에만 팀 색이 강하게 발광한다. */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { BattleShotEvent, TeamId } from "./battleTypes";

const GUN_CANVAS_WIDTH = 440;
const GUN_CANVAS_HEIGHT = 320;
const RETROGUN_TEXTURES = {
  albedo: "/models/retrogun/LaserGun_albedo.webp",
  normal: "/models/retrogun/LaserGun_normal.webp",
  roughness: "/models/retrogun/LaserGun_roughness.webp",
  metalness: "/models/retrogun/LaserGun_metalness.webp",
} as const;

function LaserGunModel({ team }: { team: TeamId }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // 레이저건은 발사 시 CSS로만 반동하므로 매 프레임 WebGL 컨텍스트를 유지할 필요가 없다.
    // 별도 캔버스에 한 번 렌더한 뒤 2D 비트맵으로 옮겨 GPU 컨텍스트를 즉시 반환한다.
    const renderCanvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({
      canvas: renderCanvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(1);
    renderer.setSize(GUN_CANVAS_WIDTH, GUN_CANVAS_HEIGHT, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, GUN_CANVAS_WIDTH / GUN_CANVAS_HEIGHT, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x28231f, 3.2));
    const keyLight = new THREE.DirectionalLight(0xfff4e8, 4.5);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb8d8ff, 2.2);
    fillLight.position.set(-4, 1, 2);
    scene.add(fillLight);

    let disposed = false;
    let model: THREE.Group | null = null;
    let loadedTextures: THREE.Texture[] = [];
    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) => textureLoader.load(url, resolve, undefined, reject));

    void Promise.all([
      loadTexture(RETROGUN_TEXTURES.albedo),
      loadTexture(RETROGUN_TEXTURES.normal),
      loadTexture(RETROGUN_TEXTURES.roughness),
      loadTexture(RETROGUN_TEXTURES.metalness),
    ]).then(([albedo, normal, roughness, metalness]) => {
      loadedTextures = [albedo, normal, roughness, metalness];
      if (disposed) {
        loadedTextures.forEach((texture) => texture.dispose());
        return;
      }
      albedo.colorSpace = THREE.SRGBColorSpace;
      for (const texture of [albedo, normal, roughness, metalness]) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 2;
      }

      new FBXLoader().load("/models/LaserGun.fbx", (loaded) => {
        if (disposed) return;
        model = loaded;
        const teamTint = new THREE.Color(team === "A" ? 0xffd0b5 : 0xbfe8ff);
        loaded.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const source = Array.isArray(child.material) ? child.material[0] : child.material;
          const material = new THREE.MeshStandardMaterial({
            map: albedo,
            normalMap: normal,
            roughnessMap: roughness,
            metalnessMap: metalness,
            color: teamTint,
            roughness: 0.88,
            metalness: 0.62,
            transparent: source?.transparent ?? false,
            opacity: source?.opacity ?? 1,
          });
          const originalMaterials = Array.isArray(child.material) ? child.material : [child.material];
          originalMaterials.forEach((original) => original.dispose());
          child.material = material;
        });

        const bounds = new THREE.Box3().setFromObject(loaded);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        loaded.position.sub(center);
        // 참고 이미지의 후방 상단 3/4 각도를 하나만 만든다. B팀도 같은
        // 렌더를 사용하고 CSS에서 수평 반전해 두 총의 원근과 실루엣을 동일하게 유지한다.
        loaded.rotation.set(-0.16, -0.58, 0.04);
        scene.add(loaded);

        const radius = Math.max(size.x, size.y, size.z) * 0.62;
        // 손잡이와 총열 윗면이 함께 보이는 비스듬한 상단 3/4 시점. 좌우는 같은
        // 카메라를 사용하고 모델의 Y 회전만 반대로 적용해 정확한 거울 대칭을 만든다.
        camera.position.set(radius * 0.72, radius * 1.08, radius * 2.35);
        camera.up.set(0, 1, 0);
        camera.lookAt(0, -radius * 0.12, 0);
        camera.near = Math.max(0.01, radius * 0.01);
        camera.far = radius * 10;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, GUN_CANVAS_WIDTH, GUN_CANVAS_HEIGHT);
        context?.drawImage(renderCanvas, 0, 0, GUN_CANVAS_WIDTH, GUN_CANVAS_HEIGHT);
        renderer.renderLists.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      }, undefined, (error) => {
        console.error("Retrogun FBX 모델을 불러오지 못했습니다.", error);
      });
    }).catch((error) => {
      console.error("Retrogun 텍스처를 불러오지 못했습니다.", error);
    });

    return () => {
      disposed = true;
      if (model) {
        scene.remove(model);
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
        });
      }
      renderer.dispose();
      loadedTextures.forEach((texture) => texture.dispose());
    };
  }, [team]);

  return <canvas ref={canvasRef} className="battle-gun__model" width={GUN_CANVAS_WIDTH} height={GUN_CANVAS_HEIGHT} aria-label={`${team} team laser gun`} />;
}

export function BattleGun({ team, shotEvents }: { team: TeamId; shotEvents: BattleShotEvent[] }): JSX.Element {
  const motionRef = useRef<HTMLDivElement>(null);
  const own = useMemo(() => shotEvents.filter((e) => e.team === team), [shotEvents, team]);
  const last = own[own.length - 1];
  const hasCoreHit = own.some((e) => e.core);

  useEffect(() => {
    if (!last || !motionRef.current) return;
    motionRef.current.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(18px)", offset: 0.3 }, { transform: "translateY(0)" }],
      { duration: 180, easing: "ease-out" },
    );
  }, [last?.id]);

  return (
    <div className={`battle-gun battle-gun--${team.toLowerCase()}`}>
      <div
        className={`battle-gun__body${last?.hit ? " battle-gun__body--hit" : ""}${hasCoreHit ? " battle-gun__body--core" : ""}`}
      >
        <div ref={motionRef} className="battle-gun__motion">
          <LaserGunModel team={team} />
        </div>
        {last && <span className="battle-gun__flash" />}
      </div>
    </div>
  );
}
