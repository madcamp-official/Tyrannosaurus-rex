import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const CANVAS_WIDTH = 620;
const CANVAS_HEIGHT = 360;

type TrexModelMode = "battle" | "winner" | "yranno";

export function BattleTrexModel({ mode = "battle" }: { mode?: TrexModelMode }): JSX.Element {
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
    // 254개의 메시로 구성된 모델을 CSS에서 2배 확대한다. DPR까지 곱해 렌더링하면
    // 픽셀 수가 급증하므로 내부 해상도는 1배로 유지하고 브라우저가 확대하도록 한다.
    renderer.setPixelRatio(1);
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, CANVAS_WIDTH / CANVAS_HEIGHT, 0.01, 1000);
    scene.add(new THREE.HemisphereLight(0xfff7e7, 0x30475f, 3.1));

    const sun = new THREE.DirectionalLight(0xffe3b0, 4.2);
    sun.position.set(-4, 7, 8);
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x8ecdf0, 2);
    rim.position.set(6, 2, -5);
    scene.add(rim);

    const motionRoot = new THREE.Group();
    scene.add(motionRoot);

    let disposed = false;
    let loadedModel: THREE.Group | null = null;

    const modelUrl = mode === "battle" ? "/models/trex_skeleton/skeleton.gltf" : "/models/trex/trex.glb";
    new GLTFLoader().load(modelUrl, (gltf) => {
      if (disposed) return;

      loadedModel = gltf.scene;
      loadedModel.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const hadMultipleMaterials = Array.isArray(child.material);
        const sources: THREE.Material[] = hadMultipleMaterials ? child.material : [child.material];
        const clonedMaterials = sources.map((source) => {
          const material = source.clone() as THREE.MeshStandardMaterial;
          if ("color" in material && mode === "battle") material.color.set(0xe8dfcf);
          if ("color" in material && mode === "yranno") material.color.multiply(new THREE.Color(0x88785b));
          if ("roughness" in material) material.roughness = 0.72;
          if ("metalness" in material) material.metalness = 0.04;
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
          return material;
        });
        // 단일 재질 메시를 배열로 바꾸면 geometry group이 없는 GLTF 메시가
        // draw call을 만들지 못한다. 원본 재질 형태를 그대로 유지해야 한다.
        child.material = hadMultipleMaterials ? clonedMaterials : clonedMaterials[0]!;
      });

      // 원본 모델의 긴 몸체 축은 Z축이다. Y축으로 90도 돌려 머리~꼬리
      // 방향을 화면 가로축에 놓아 정면 카메라에서 전체 실루엣이 보이게 한다.
      loadedModel.rotation.y = Math.PI / 2;
      const bounds = new THREE.Box3().setFromObject(loadedModel);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      loadedModel.position.sub(center);
      motionRoot.add(loadedModel);

      // 깊이 최댓값이 아니라 화면에 투영되는 가로·세로 크기로 거리를 맞춘다.
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));
      const distanceForWidth = size.x / (2 * Math.tan(horizontalFov / 2));
      const cameraDistance = Math.max(distanceForHeight, distanceForWidth) * 1.18 + size.z * 0.5;
      camera.position.set(0, size.y * 0.04, cameraDistance);
      camera.lookAt(0, 0, 0);
      camera.near = Math.max(0.01, cameraDistance - size.z * 1.5);
      camera.far = cameraDistance + size.z * 2;
      camera.updateProjectionMatrix();

      if (mode === "yranno") {
        motionRoot.rotation.z = -0.12;
      }

      // 254개 메시를 매 프레임 다시 그리는 대신 모델 자체는 한 번만 렌더링한다.
      // 사격 이동과 결과 화면의 폴짝임은 캔버스 바깥 DOM 컨테이너가 담당한다.
      renderer.render(scene, camera);
    }, undefined, (error) => {
      console.error(`${mode === "battle" ? "스켈레톤" : "티라노사우루스"} 모델을 불러오지 못했습니다.`, error);
    });

    return () => {
      disposed = true;
      if (loadedModel) {
        motionRoot.remove(loadedModel);
        loadedModel.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
        });
      }
      renderer.dispose();
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      className={`battle-trex__model battle-trex__model--${mode}`}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      aria-label={mode === "battle" ? "움직이는 스켈레톤 티라노사우루스" : mode === "yranno" ? "와이라노" : "폴짝이는 티라노사우루스"}
    />
  );
}
