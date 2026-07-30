import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BATTLE_WALK_FPS = 24;
const RESULT_WALK_FPS = 15;

type TrexModelMode = "battle" | "winner" | "yranno";
type BattlePresentation = "front" | "flee" | "final";

export function BattleTrexModel({
  mode = "battle",
  presentation = "front",
}: {
  mode?: TrexModelMode;
  presentation?: BattlePresentation;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const isWinner = mode === "winner";
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    // CSS 확대 시 원본 620×360 비트맵이 그대로 늘어나던 현상을 막기 위해
    // 내부 해상도를 두 배로 올린다. DPR은 1로 제한해 모바일 GPU 부하는 억제한다.
    renderer.setPixelRatio(1);
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isWinner ? 1.42 : 1.25;

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

    let resultGround: THREE.Mesh | null = null;
    const resultTextures: THREE.Texture[] = [];
    if (isWinner) {
      const textureLoader = new THREE.TextureLoader();
      const sky = textureLoader.load("/images/victory-meadow.png");
      sky.colorSpace = THREE.SRGBColorSpace;
      scene.background = sky;
      resultTextures.push(sky);

      resultGround = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 18),
        // 생성된 초원 이미지가 그대로 비치도록 색 바닥을 없애고 그림자만 얹는다.
        // 기존 단색 녹색 Plane이 배경 전경과 맞지 않아 경계가 선명하게 보였다.
        new THREE.ShadowMaterial({ color: 0x263719, opacity: 0.24 }),
      );
      resultGround.rotation.x = -Math.PI / 2;
      resultGround.receiveShadow = true;
      scene.add(resultGround);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    let disposed = false;
    let loadedModel: THREE.Group | null = null;
    let animationFrame = 0;
    let animationStartedAt = 0;
    let previousRenderTime = 0;

    const modelUrl = mode === "battle" ? "/models/trex_skeleton/skeleton.gltf" : "/models/trex/trex.glb";
    new GLTFLoader().load(modelUrl, (gltf) => {
      if (disposed) return;

      loadedModel = gltf.scene;
      loadedModel.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (isWinner) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
        const hadMultipleMaterials = Array.isArray(child.material);
        const sources: THREE.Material[] = hadMultipleMaterials ? child.material : [child.material];
        const clonedMaterials = sources.map((source) => {
          const material = source.clone() as THREE.MeshStandardMaterial;
          if ("color" in material && mode === "battle") material.color.set(0xe8dfcf);
          if ("color" in material && isWinner) material.color.offsetHSL(0, -0.02, 0.1);
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

      // 원본 모델의 긴 몸체 축은 Z축이다. 사격과 승리 화면 모두 회전하지
      // 않은 정면 자세를 사용하고, 정적인 와이라노만 기존 옆면 구도를 유지한다.
      loadedModel.rotation.y = mode === "yranno" ? Math.PI / 2 : 0;
      let bounds = new THREE.Box3().setFromObject(loadedModel);
      let center = bounds.getCenter(new THREE.Vector3());

      if (mode === "battle") {
        // 모델마다 원본 축이 조금씩 다르므로 이름이 지정된 머리 노드를 기준으로
        // 머리 방향을 카메라(+Z) 쪽에 정확히 맞춘다.
        loadedModel.position.sub(center);
        loadedModel.updateMatrixWorld(true);
        const headPosition = loadedModel.getObjectByName("Head")?.getWorldPosition(new THREE.Vector3());
        if (headPosition) {
          loadedModel.rotation.y = Math.atan2(-headPosition.x, headPosition.z);
        }
        loadedModel.position.set(0, 0, 0);
        loadedModel.updateMatrixWorld(true);
        bounds = new THREE.Box3().setFromObject(loadedModel);
        center = bounds.getCenter(new THREE.Vector3());
        if (presentation === "flee") loadedModel.rotation.y += Math.PI;
      }

      const size = bounds.getSize(new THREE.Vector3());
      loadedModel.position.sub(center);
      motionRoot.add(loadedModel);
      if (resultGround) {
        resultGround.position.y = -size.y * 0.5;
        resultGround.scale.setScalar(Math.max(size.x, size.y, size.z) / 5);
      }

      // 깊이 최댓값이 아니라 화면에 투영되는 가로·세로 크기로 거리를 맞춘다.
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));
      const distanceForWidth = size.x / (2 * Math.tan(horizontalFov / 2));
      const cameraDistance = Math.max(distanceForHeight, distanceForWidth) * 1.18 + size.z * 0.5;
      const viewDistance = isWinner ? cameraDistance * 0.84 : cameraDistance;
      camera.position.set(0, isWinner ? size.y * 0.2 : size.y * 0.04, viewDistance);
      camera.lookAt(0, isWinner ? size.y * 0.08 : 0, 0);
      camera.near = Math.max(0.01, viewDistance - size.z * 1.5);
      camera.far = viewDistance + size.z * 2;
      camera.updateProjectionMatrix();

      if (mode === "yranno") {
        motionRoot.rotation.z = -0.12;
      }

      if (mode === "yranno" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // 와이라노와 모션 감소 환경은 정지 화면으로 한 번만 렌더링한다.
        renderer.render(scene, camera);
        return;
      }

      if (mode === "battle") {
        // 정면으로 등장한 뒤 좌우 사선과 측면을 번갈아 보여 주며 걷는다.
        // 매 프레임 렌더링하지 않고 15fps로 제한해 사격 중 GPU 부하를 억제한다.
        renderer.render(scene, camera);
        const animateBattle = (time: number) => {
          if (disposed) return;
          animationFrame = window.requestAnimationFrame(animateBattle);
          if (animationStartedAt === 0) animationStartedAt = time;
          const interval = 1000 / BATTLE_WALK_FPS;
          if (document.hidden || time - previousRenderTime < interval) return;
          previousRenderTime = time - ((time - previousRenderTime) % interval);

          const elapsed = (time - animationStartedAt) / 1000;
          const step = elapsed * (presentation === "flee" ? 10.5 : 5.2);
          // 단일 사인 곡선으로 -30°부터 +30°까지 연속 회전한다. 서버 facing
          // 값으로 캔버스를 순간 반전하지 않으므로 방향 전환 중 각도가 끊기지 않는다.
          if (presentation === "front") {
            motionRoot.rotation.y = Math.sin(elapsed * 0.42) * Math.PI / 6;
            motionRoot.rotation.z = Math.sin(step) * 0.008;
            motionRoot.position.y = Math.abs(Math.sin(step)) * size.y * 0.006;
          } else if (presentation === "flee") {
            // 완전히 뒤를 향한 자세를 중심으로 좌우 ±12.5도만 보여준다.
            // 달리기 보폭보다 느린 주기로 흔들어 방향을 살피며 도망치는 느낌을 만든다.
            motionRoot.rotation.y = Math.sin(elapsed * 1.35) * THREE.MathUtils.degToRad(12.5);
            motionRoot.rotation.z = Math.sin(step * 0.5) * 0.025;
            motionRoot.position.y = Math.abs(Math.sin(step)) * size.y * 0.018;
          } else {
            const breath = 1 + Math.sin(elapsed * 2.8) * 0.012;
            motionRoot.rotation.set(0, 0, 0);
            motionRoot.position.set(0, Math.sin(elapsed * 2.8) * size.y * 0.004, 0);
            motionRoot.scale.setScalar(breath);
          }
          renderer.render(scene, camera);
        };
        animationFrame = window.requestAnimationFrame(animateBattle);
        return;
      }

      // 육체 티라노는 카메라 정면을 계속 바라본 채 제자리에서 폴짝인다.
      // 좌우 이동과 Y축 회전을 없애 결과 화면에서 빙글 도는 인상을 제거한다.
      const animateWinner = (time: number) => {
        if (disposed) return;
        animationFrame = window.requestAnimationFrame(animateWinner);
        if (animationStartedAt === 0) animationStartedAt = time;
        const interval = 1000 / RESULT_WALK_FPS;
        if (document.hidden || time - previousRenderTime < interval) return;
        previousRenderTime = time - ((time - previousRenderTime) % interval);

        const elapsed = (time - animationStartedAt) / 1000;
        const jump = Math.sin(elapsed * Math.PI * 1.6);
        const jumpHeight = Math.max(0, jump) ** 2;
        motionRoot.position.x = 0;
        motionRoot.position.y = jumpHeight * size.y * 0.12;
        motionRoot.rotation.x = -jumpHeight * 0.035;
        motionRoot.rotation.y = Math.sin(elapsed * 0.75) * Math.PI / 6;
        motionRoot.rotation.z = Math.sin(elapsed * Math.PI * 3.2) * 0.006;
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
      resultTextures.forEach((texture) => texture.dispose());
      if (resultGround) {
        resultGround.geometry.dispose();
        (resultGround.material as THREE.Material).dispose();
      }
      renderer.dispose();
    };
  }, [mode, presentation]);

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
