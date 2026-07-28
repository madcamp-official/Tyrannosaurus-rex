/** 화면 하단 귀퉁이 레이건. 평시엔 무채색에 가깝고, 발사·명중 순간에만 팀 색이 강하게 발광한다. */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { BattleShotEvent, TeamId } from "./battleTypes";

function LaserGunModel({ team }: { team: TeamId }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(150, 190, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 150 / 190, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x24160f, 2.8));
    const keyLight = new THREE.DirectionalLight(team === "A" ? 0xff9d55 : 0x71d2ff, 5);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    let disposed = false;
    let model: THREE.Group | null = null;
    const loader = new FBXLoader();
    loader.load("/models/LaserGun.fbx", (loaded) => {
      if (disposed) return;
      model = loaded;
      const tint = new THREE.Color(team === "A" ? 0xf06c2e : 0x159bd0);
      loaded.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        child.material = materials.map((source) => {
          const material = source.clone() as THREE.MeshStandardMaterial;
          if ("color" in material) material.color.lerp(tint, 0.42);
          if ("emissive" in material) {
            material.emissive.copy(tint);
            material.emissiveIntensity = 0.16;
          }
          material.needsUpdate = true;
          return material;
        });
      });

      const bounds = new THREE.Box3().setFromObject(loaded);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      loaded.position.sub(center);
      loaded.rotation.set(-0.1, team === "A" ? -0.55 : 0.55, -0.12);
      scene.add(loaded);

      const radius = Math.max(size.x, size.y, size.z) * 0.62;
      camera.position.set(0, radius * 0.08, radius * 3.1);
      camera.lookAt(0, 0, 0);
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

  return <canvas ref={canvasRef} className="battle-gun__model" width={150} height={190} aria-label={`${team}팀 레이저건`} />;
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
