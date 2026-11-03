import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface LiquidGlassShapeConfig {
  width?: number | null;
  height?: number | null;
  ratio?: number;
  radius?: number | null;
  depth?: number | null;
  borderRadius?: number;
  borderRadiusSegments?: number;
  segments?: number;
  capSegments?: number;
  radialSegments?: number;
  diameter?: number | null;
  majorDiameter?: number | null;
  minorDiameter?: number | null;
  rotationXDeg?: number;
  rotationYDeg?: number;
  rotationZDeg?: number;
  translateX?: number;
  translateY?: number;
  translateZ?: number;
  dilationX?: number;
  dilationY?: number;
  dilationZ?: number;
}

export interface LiquidGlassMaterialConfig {
  color?: string;
  roughness?: number;
  metalness?: number;
  transmission?: number;
  ior?: number;
  thickness?: number;
  reflectivity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  iridescenceThicknessRange?: [number, number];
  attenuationColor?: string;
  attenuationDistance?: number;
}

export interface LiquidGlassBackgroundConfig {
  type?: "gradient" | "image";
  imageUrl?: string | null;
}

export interface LiquidGlassOptions {
  dpr?: number | [number, number];
  bgColor?: string;
  bgOpacity?: number;
  shape?: LiquidGlassShapeConfig;
  material?: LiquidGlassMaterialConfig;
  background?: LiquidGlassBackgroundConfig;
}

export interface LiquidGlassController {
  render: () => void;
  resize: () => void;
  update: (nextOptions?: Partial<LiquidGlassOptions>) => void;
  setShapeTransform: (nextShape?: Partial<LiquidGlassShapeConfig>) => void;
  getOptions: () => LiquidGlassOptions;
  destroy: () => void;
}

export const DEFAULT_OPTIONS: LiquidGlassOptions = {
  dpr: [1, 2],
  bgColor: "#0e0f12",
  bgOpacity: 0,
  shape: {
    width: null,
    height: null,
    ratio: 3.4,
    radius: null,
    depth: null,
    borderRadius: 0.16,
    borderRadiusSegments: 4,
    segments: 64,
    capSegments: 16,
    radialSegments: 64,
    diameter: null,
    majorDiameter: null,
    minorDiameter: null,
    rotationXDeg: 0,
    rotationYDeg: 0,
    rotationZDeg: 0,
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    dilationX: 1,
    dilationY: 1,
    dilationZ: 1,
  },
  material: {
    color: "#ffffff",
    roughness: 0.05,
    metalness: 0,
    transmission: 1,
    ior: 1.45,
    thickness: 0.55,
    reflectivity: 0.6,
    clearcoat: 0.2,
    clearcoatRoughness: 0.1,
    iridescence: 0.8,
    iridescenceIOR: 1.0,
    iridescenceThicknessRange: [120, 360],
    attenuationColor: "#ffffff",
    attenuationDistance: 0.75,
  },
  background: {
    type: "gradient",
    imageUrl: null,
  },
};

function deepMerge<T extends Record<string, any>>(base: T, override?: Partial<T>): T {
  if (!override) return { ...base };
  const output: any = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof base[key] === "object" &&
      base[key] !== null
    ) {
      output[key] = deepMerge(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function makeGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#2a2f57");
  grad.addColorStop(0.45, "#873c7f");
  grad.addColorStop(1, "#1f6f72");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = Math.random() * 36 + 10;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function toPixelRatio(value: number | [number, number] | undefined): number {
  if (Array.isArray(value)) {
    const max = value[1] ?? value[0] ?? 2;
    return Math.min(window.devicePixelRatio || 1, max);
  }
  return value || 1;
}

function toPositiveNumber(value: any): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function toFiniteNumber(value: any, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toScaleNumber(value: any, fallback = 1): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeOptions(options: Partial<LiquidGlassOptions> = {}): LiquidGlassOptions {
  const merged = deepMerge(DEFAULT_OPTIONS, options);
  return merged.shape ? merged : { ...merged, shape: { ...DEFAULT_OPTIONS.shape } };
}

function cloneOptions(value: any): LiquidGlassOptions {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function resolveAutoDimensions(shapeConfig: LiquidGlassShapeConfig, camera: THREE.PerspectiveCamera) {
  const ratio = toPositiveNumber(shapeConfig.ratio) ?? (DEFAULT_OPTIONS.shape?.ratio || 3.4);

  let width = toPositiveNumber(shapeConfig.width);
  const height = toPositiveNumber(shapeConfig.height);

  if (!width) {
    const radius = toPositiveNumber(shapeConfig.radius);
    if (radius) width = radius * 2;
  }

  if (width && height) return { width, height };
  if (width) return { width, height: width * ratio };
  if (height) return { width: height / ratio, height };

  const distance = Math.max(0.001, camera.position.z);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const viewportHeight = 2 * Math.tan(verticalFov / 2) * distance;
  const viewportWidth = viewportHeight * camera.aspect;

  const maxAutoHeight = viewportHeight * 0.72;
  const maxAutoWidth = viewportWidth * 0.42;

  let autoHeight = maxAutoHeight;
  let autoWidth = autoHeight / ratio;

  if (autoWidth > maxAutoWidth) {
    autoWidth = maxAutoWidth;
    autoHeight = autoWidth * ratio;
  }

  return { width: autoWidth, height: autoHeight };
}

function resolveEllipseDimensions(shapeConfig: LiquidGlassShapeConfig, camera: THREE.PerspectiveCamera, fnName: string) {
  const diameter = toPositiveNumber(shapeConfig.diameter);
  const majorDiameter = toPositiveNumber(shapeConfig.majorDiameter);
  const minorDiameter = toPositiveNumber(shapeConfig.minorDiameter);

  if (diameter) return { width: diameter, height: diameter };

  if (majorDiameter || minorDiameter) {
    if (!majorDiameter || !minorDiameter) {
      throw new Error(`${fnName}: shape.majorDiameter and shape.minorDiameter must both be provided.`);
    }
    return { width: majorDiameter, height: minorDiameter };
  }

  return resolveAutoDimensions(shapeConfig, camera);
}

function resolveDimensions(kind: string, shapeConfig: LiquidGlassShapeConfig, camera: THREE.PerspectiveCamera, fnName: string) {
  if (kind === "ellipse") {
    return resolveEllipseDimensions(shapeConfig, camera, fnName);
  }
  return resolveAutoDimensions(shapeConfig, camera);
}

function validateCapsuleDimensions(width: number, height: number, fnName: string) {
  if (height < width) {
    throw new Error(
      `${fnName}: invalid dimensions. Capsule height includes both end caps and must be >= width (diameter).`
    );
  }
}

function createGeometry(kind: string, shapeConfig: LiquidGlassShapeConfig, dimensions: { width: number; height: number }, fnName: string): THREE.BufferGeometry {
  const width = Math.max(0.001, dimensions.width);
  const height = Math.max(0.001, dimensions.height);

  if (kind === "capsule") {
    validateCapsuleDimensions(width, height, fnName);
    const radius = Math.max(0.001, width / 2);
    const length = Math.max(0.001, height - radius * 2);
    return new THREE.CapsuleGeometry(radius, length, shapeConfig.capSegments || 16, shapeConfig.radialSegments || 64);
  }

  if (kind === "rect") {
    const depth = toPositiveNumber(shapeConfig.depth) ?? Math.max(0.001, Math.min(width, height) * 0.34);
    const radiusRaw = toPositiveNumber(shapeConfig.borderRadius) ?? 0.12;
    const radius = Math.min(radiusRaw, width / 2, height / 2, depth / 2);
    const segments = Math.max(1, Math.round(toPositiveNumber(shapeConfig.borderRadiusSegments) ?? 4));
    if (radius > 0) {
      return new RoundedBoxGeometry(width, height, depth, segments, radius);
    }
    return new THREE.BoxGeometry(width, height, depth);
  }

  const radius = 0.5;
  const segments = Math.max(8, Math.round(toPositiveNumber(shapeConfig.segments) ?? 64));
  const rings = Math.max(6, Math.round(segments * 0.75));
  return new THREE.SphereGeometry(radius, segments, rings);
}

function applyShapeScale(kind: string, mesh: THREE.Mesh, dimensions: { width: number; height: number }, shapeConfig: LiquidGlassShapeConfig) {
  const sx = toScaleNumber(shapeConfig.dilationX, 1);
  const sy = toScaleNumber(shapeConfig.dilationY, 1);
  const sz = toScaleNumber(shapeConfig.dilationZ, 1);

  if (kind === "ellipse") {
    const ex = Math.max(0.001, dimensions.width);
    const ey = Math.max(0.001, dimensions.height);
    mesh.scale.set(ex * sx, ey * sy, ex * sz);
    return;
  }
  mesh.scale.set(sx, sy, sz);
}

function applyShapeRotation(mesh: THREE.Mesh, shapeConfig: LiquidGlassShapeConfig) {
  const x = THREE.MathUtils.degToRad(toFiniteNumber(shapeConfig.rotationXDeg, 0));
  const y = THREE.MathUtils.degToRad(toFiniteNumber(shapeConfig.rotationYDeg, 0));
  const z = THREE.MathUtils.degToRad(toFiniteNumber(shapeConfig.rotationZDeg, 0));
  mesh.rotation.set(x, y, z);
  mesh.position.set(
    toFiniteNumber(shapeConfig.translateX, 0),
    toFiniteNumber(shapeConfig.translateY, 0),
    toFiniteNumber(shapeConfig.translateZ, 0)
  );
}

export function drawLiquidShape(container: HTMLElement, options: Partial<LiquidGlassOptions> = {}, kind: string, fnName: string): LiquidGlassController {
  if (!(container instanceof HTMLElement)) {
    throw new Error(`${fnName}(container, options): container must be an HTMLElement.`);
  }

  let config = normalizeOptions(options);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(toPixelRatio(config.dpr));
  renderer.setClearColor(config.bgColor || "#0e0f12", config.bgOpacity ?? 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(25, 1, 0.01, 100);
  camera.position.set(0, 0, 2.35);

  const fillLight = new THREE.DirectionalLight("#ffffff", 2.4);
  fillLight.position.set(0.8, 1.2, 1.4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight("#c8d8ff", 0.9);
  rimLight.position.set(-1.2, -0.6, 1.1);
  scene.add(rimLight);

  const backgroundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 3.8),
    new THREE.MeshBasicMaterial({ toneMapped: false })
  );
  backgroundPlane.position.set(0, 0, -0.8);
  scene.add(backgroundPlane);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: config.material?.color || "#ffffff",
    roughness: config.material?.roughness ?? 0.05,
    metalness: config.material?.metalness ?? 0,
    transmission: config.material?.transmission ?? 1,
    ior: config.material?.ior ?? 1.45,
    thickness: config.material?.thickness ?? 0.55,
    reflectivity: config.material?.reflectivity ?? 0.6,
    clearcoat: config.material?.clearcoat ?? 0.2,
    clearcoatRoughness: config.material?.clearcoatRoughness ?? 0.1,
    iridescence: config.material?.iridescence ?? 0.8,
    iridescenceIOR: config.material?.iridescenceIOR ?? 1.0,
    iridescenceThicknessRange: config.material?.iridescenceThicknessRange || [120, 360],
    attenuationColor: new THREE.Color(config.material?.attenuationColor || "#ffffff"),
    attenuationDistance: config.material?.attenuationDistance ?? 0.75,
  });

  let currentDimensions = { width: 0.1, height: 0.1 };
  let shapeGeometry = createGeometry(kind, config.shape || {}, currentDimensions, fnName);
  const shapeMesh = new THREE.Mesh(shapeGeometry, glassMaterial);
  scene.add(shapeMesh);

  let bgTexture: THREE.Texture | null = null;

  function applyRendererConfig() {
    renderer.setPixelRatio(toPixelRatio(config.dpr));
    renderer.setClearColor(config.bgColor || "#0e0f12", config.bgOpacity ?? 0);
  }

  function applyMaterialConfig() {
    if (!config.material) return;
    glassMaterial.color.set(config.material.color || "#ffffff");
    glassMaterial.roughness = config.material.roughness ?? 0.05;
    glassMaterial.metalness = config.material.metalness ?? 0;
    glassMaterial.transmission = config.material.transmission ?? 1;
    glassMaterial.ior = config.material.ior ?? 1.45;
    glassMaterial.thickness = config.material.thickness ?? 0.55;
    glassMaterial.reflectivity = config.material.reflectivity ?? 0.6;
    glassMaterial.clearcoat = config.material.clearcoat ?? 0.2;
    glassMaterial.clearcoatRoughness = config.material.clearcoatRoughness ?? 0.1;
    glassMaterial.iridescence = config.material.iridescence ?? 0.8;
    glassMaterial.iridescenceIOR = config.material.iridescenceIOR ?? 1.0;
    if (config.material.iridescenceThicknessRange) {
      glassMaterial.iridescenceThicknessRange = config.material.iridescenceThicknessRange;
    }
    glassMaterial.attenuationColor = new THREE.Color(config.material.attenuationColor || "#ffffff");
    glassMaterial.attenuationDistance = config.material.attenuationDistance ?? 0.75;
    glassMaterial.needsUpdate = true;
  }

  function render() {
    renderer.render(scene, camera);
  }

  function applyBackgroundTexture() {
    if (bgTexture) bgTexture.dispose();

    if (config.background?.type === "image" && config.background?.imageUrl) {
      bgTexture = new THREE.TextureLoader().load(config.background.imageUrl, () => {
        render();
      });
      bgTexture.colorSpace = THREE.SRGBColorSpace;
      backgroundPlane.material = new THREE.MeshBasicMaterial({ map: bgTexture, toneMapped: false });
      return;
    }

    bgTexture = makeGradientTexture();
    backgroundPlane.material = new THREE.MeshBasicMaterial({ map: bgTexture, toneMapped: false });
  }

  function updateShapeGeometry() {
    const dimensions = resolveDimensions(kind, config.shape || {}, camera, fnName);
    currentDimensions = dimensions;
    const nextGeometry = createGeometry(kind, config.shape || {}, dimensions, fnName);
    shapeMesh.geometry.dispose();
    shapeMesh.geometry = nextGeometry;
    shapeGeometry = nextGeometry;
    applyShapeScale(kind, shapeMesh, dimensions, config.shape || {});
    applyShapeRotation(shapeMesh, config.shape || {});
  }

  function setShapeTransform(nextShape: Partial<LiquidGlassShapeConfig> = {}) {
    config.shape = deepMerge(config.shape || {}, nextShape);
    applyShapeScale(kind, shapeMesh, currentDimensions, config.shape || {});
    applyShapeRotation(shapeMesh, config.shape || {});
    render();
  }

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    renderer.setSize(width, height, true);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateShapeGeometry();
    render();
  }

  function update(nextOptions: Partial<LiquidGlassOptions> = {}) {
    config = normalizeOptions(deepMerge(config, nextOptions));
    applyRendererConfig();
    applyMaterialConfig();
    applyBackgroundTexture();
    resize();
  }

  function getOptions(): LiquidGlassOptions {
    return cloneOptions(config);
  }

  applyRendererConfig();
  applyMaterialConfig();
  applyBackgroundTexture();
  resize();

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);

  return {
    render,
    resize,
    update,
    setShapeTransform,
    getOptions,
    destroy() {
      resizeObserver.disconnect();

      if (bgTexture) bgTexture.dispose();
      shapeGeometry.dispose();
      glassMaterial.dispose();
      backgroundPlane.geometry.dispose();
      (backgroundPlane.material as THREE.Material).dispose();
      pmrem.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}

export function drawLiquidCapsule(container: HTMLElement, options: Partial<LiquidGlassOptions> = {}) {
  return drawLiquidShape(container, options, "capsule", "drawLiquidCapsule");
}

export function drawLiquidRect(container: HTMLElement, options: Partial<LiquidGlassOptions> = {}) {
  return drawLiquidShape(container, options, "rect", "drawLiquidRect");
}

export function drawLiquidEllipse(container: HTMLElement, options: Partial<LiquidGlassOptions> = {}) {
  return drawLiquidShape(container, options, "ellipse", "drawLiquidEllipse");
}

export default drawLiquidCapsule;
