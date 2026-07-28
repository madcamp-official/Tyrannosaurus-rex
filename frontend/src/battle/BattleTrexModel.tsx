import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const CANVAS_WIDTH = 460;
const CANVAS_HEIGHT = 300;

export function BattleTrexModel(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    let frame = 0;
    const clock = new THREE.Clock();

    new GLTFLoader().load("/models/trex_skeleton/skeleton.gltf", (gltf) => {
      if (disposed) return;

      loadedModel = gltf.scene;
      loadedModel.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const sources = Array.isArray(child.material) ? child.material : [child.material];
        child.material = sources.map((source) => {
          const material = source.clone() as THREE.MeshStandardMaterial;
          if ("color" in material) material.color.set(0xe8dfcf);
          if ("roughness" in material) material.roughness = 0.72;
          if ("metalness" in material) material.metalness = 0.04;
          material.needsUpdate = true;
          return material;
        });
      });

      const bounds = new THREE.Box3().setFromObject(loadedModel);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      loadedModel.position.sub(center);
      motionRoot.add(loadedModel);

      const radius = Math.max(size.x, size.y, size.z) * 0.56;
      camera.position.set(0, radius * 0.08, radius * 3.4);
      camera.lookAt(0, 0, 0);
      camera.near = Math.max(0.01, radius * 0.01);
      camera.far = radius * 12;
      camera.updateProjectionMatrix();

      const animate = () => {
        if (disposed) return;
        const elapsed = clock.getElapsedTime();
        motionRoot.position.y = Math.sin(elapsed * 4.2) * radius * 0.018;
        motionRoot.rotation.y = Math.sin(elapsed * 1.7) * 0.045;
        motionRoot.rotation.z = Math.sin(elapsed * 4.2) * 0.012;
        renderer.render(scene, camera);
        frame = window.requestAnimationFrame(animate);
      };
      animate();
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="battle-trex__model"
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      aria-label="움직이는 스켈레톤 티라노사우루스"
    />
  );
}
