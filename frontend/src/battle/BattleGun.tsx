/** 화면 하단 귀퉁이 레이건. 평시엔 무채색에 가깝고, 발사·명중 순간에만 팀 색이 강하게 발광한다. */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { BattleShotEvent, TeamId } from "./battleTypes";

const GUN_CANVAS_WIDTH = 440;
const GUN_CANVAS_HEIGHT = 320;

function LaserGunModel({ team }: { team: TeamId }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({
      canvas,
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
    const loader = new FBXLoader();
    loader.load("/models/LaserGun.fbx", (loaded) => {
      if (disposed) return;
      model = loaded;
      loaded.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const hadMultipleMaterials = Array.isArray(child.material);
        const materials: THREE.Material[] = hadMultipleMaterials ? child.material : [child.material];
        const clonedMaterials = materials.map((source) => source.clone());
        child.material = hadMultipleMaterials ? clonedMaterials : clonedMaterials[0]!;
      });

      const bounds = new THREE.Box3().setFromObject(loaded);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      loaded.position.sub(center);
      loaded.rotation.set(-0.26, team === "A" ? -0.48 : 0.48, team === "A" ? -0.1 : 0.1);
      loaded.position.y -= size.y * 0.08;
      scene.add(loaded);

      const radius = Math.max(size.x, size.y, size.z) * 0.62;
      camera.position.set(team === "A" ? radius * 0.12 : -radius * 0.12, radius * 0.12, radius * 2.25);
      camera.lookAt(0, -radius * 0.06, 0);
      camera.near = Math.max(0.01, radius * 0.01);
      camera.far = radius * 10;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
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
    };
  }, [team]);

  return <canvas ref={canvasRef} className="battle-gun__model" width={GUN_CANVAS_WIDTH} height={GUN_CANVAS_HEIGHT} aria-label={`${team} team laser gun`} />;
}

export function BattleGun({ team, shotEvents }: { team: TeamId; shotEvents: BattleShotEvent[] }): JSX.Element {
  const own = useMemo(() => shotEvents.filter((e) => e.team === team), [shotEvents, team]);
  const last = own[own.length - 1];
  const hasCoreHit = own.some((e) => e.core);

  return (
    <div className={`battle-gun battle-gun--${team.toLowerCase()}`}>
      <div
        key={last?.id ?? "idle"}
        className={`battle-gun__body${last ? " battle-gun__body--recoil" : ""}${last?.hit ? " battle-gun__body--hit" : ""}${hasCoreHit ? " battle-gun__body--core" : ""}`}
      >
        <LaserGunModel team={team} />
        {last && <span className="battle-gun__flash" />}
      </div>
    </div>
  );
}
