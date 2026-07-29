import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const CANVAS_WIDTH = 620;
const CANVAS_HEIGHT = 360;
const RESULT_WALK_FPS = 15;

function makeMeadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#517438";
  context.fillRect(0, 0, 96, 96);
  for (let i = 0; i < 380; i += 1) {
    const lightness = 28 + ((i * 17) % 18);
    context.fillStyle = `hsl(${92 + (i % 19)}, 38%, ${lightness}%)`;
    context.fillRect((i * 37) % 96, (i * 61) % 96, 1 + (i % 2), 2 + (i % 3));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

type TrexModelMode = "battle" | "winner" | "yranno";

export function BattleTrexModel({ mode = "battle" }: { mode?: TrexModelMode }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const isWinner = mode === "winner";
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: !isWinner,
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
    if (isWinner) {
      scene.background = new THREE.Color(0xaedaf0);
      scene.fog = new THREE.Fog(0xaedaf0, 16, 42);
    }
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
    let meadowGeometry: THREE.PlaneGeometry | null = null;
    let meadowMaterial: THREE.MeshStandardMaterial | null = null;
    let meadowTexture: THREE.CanvasTexture | null = null;
    let animationFrame = 0;
    let animationStartedAt = 0;
    let previousRenderTime = 0;

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
          material.side = THREE.FrontSide;
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

      if (isWinner) {
        meadowTexture = makeMeadowTexture();
        meadowGeometry = new THREE.PlaneGeometry(size.x * 5.5, size.x * 2.8, 1, 1);
        meadowMaterial = new THREE.MeshStandardMaterial({
          map: meadowTexture,
          color: 0xb5d58b,
          roughness: 1,
          metalness: 0,
        });
        const meadow = new THREE.Mesh(meadowGeometry, meadowMaterial);
        meadow.rotation.x = -Math.PI / 2;
        meadow.position.y = -size.y * 0.5;
        meadow.position.z = -size.z * 0.22;
        scene.add(meadow);
      }

      // 깊이 최댓값이 아니라 화면에 투영되는 가로·세로 크기로 거리를 맞춘다.
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));
      const distanceForWidth = size.x / (2 * Math.tan(horizontalFov / 2));
      const cameraDistance = Math.max(distanceForHeight, distanceForWidth) * 1.18 + size.z * 0.5;
      camera.position.set(0, isWinner ? size.y * 0.2 : size.y * 0.04, cameraDistance);
      camera.lookAt(0, isWinner ? -size.y * 0.12 : 0, 0);
      camera.near = Math.max(0.01, cameraDistance - size.z * 1.5);
      camera.far = cameraDistance + size.z * 2;
      camera.updateProjectionMatrix();

      if (mode === "yranno") {
        motionRoot.rotation.z = -0.12;
      }

      if (mode !== "winner" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // 사격 스켈레톤과 와이라노는 정지 화면이므로 한 번만 렌더링한다.
        renderer.render(scene, camera);
        return;
      }

      // 원본 육체 티라노에는 리그/걷기 클립이 없다. 실제 3D 모델을 초원 위에서 이동시키고,
      // 보폭에 맞춘 상하·앞뒤 흔들림과 방향 전환을 조합해 걷는 움직임을 만든다.
      const animateWinner = (time: number) => {
        if (disposed) return;
        animationFrame = window.requestAnimationFrame(animateWinner);
        if (animationStartedAt === 0) animationStartedAt = time;
        const interval = 1000 / RESULT_WALK_FPS;
        if (document.hidden || time - previousRenderTime < interval) return;
        previousRenderTime = time - ((time - previousRenderTime) % interval);

        const elapsed = (time - animationStartedAt) / 1000;
        const travel = Math.sin(elapsed * 0.72);
        const direction = Math.cos(elapsed * 0.72);
        const step = elapsed * 5.6;
        motionRoot.position.x = travel * size.x * 0.34;
        motionRoot.position.y = Math.abs(Math.sin(step)) * size.y * 0.025;
        motionRoot.rotation.z = Math.sin(step) * 0.018;
        const targetFacing = direction >= 0 ? 0 : Math.PI;
        motionRoot.rotation.y = THREE.MathUtils.lerp(motionRoot.rotation.y, targetFacing, 0.16);
        renderer.render(scene, camera);
      };
      animationFrame = window.requestAnimationFrame(animateWinner);
    }, undefined, (error) => {
      console.error(`${mode === "battle" ? "스켈레톤" : "티라노사우루스"} 모델을 불러오지 못했습니다.`, error);
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
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
      meadowGeometry?.dispose();
      meadowMaterial?.dispose();
      meadowTexture?.dispose();
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
