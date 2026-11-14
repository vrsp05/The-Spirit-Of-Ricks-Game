import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GAME_CONFIG } from '../config/game.config';
import type { Atmosphere } from '../config/atmosphere';
import { SETTINGS } from '../core/settings';

/** colorAmount: 0 = full sepia (opening), 1 = full colour. Symbolic, not a time change. */
const SepiaShader = {
  uniforms: { tDiffuse: { value: null }, exposure: { value: 0.72 }, colorAmount: { value: 0 }, saturation: { value: 1.2 }, warmth: { value: 0.06 }, contrast: { value: 1.05 }, grain: { value: 0.03 }, time: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  // Colour side: a warm "90s photo" grade (saturation, warmth, contrast, light grain).
  // HDR in → Khronos PBR Neutral tone mapping (keeps hues true, rolls off highlights) → grade.
  fragmentShader: `uniform sampler2D tDiffuse; uniform float exposure, colorAmount, saturation, warmth, contrast, grain, time; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    vec3 neutral(vec3 color){
      const float startCompression = 0.76; const float desaturation = 0.15;
      float x = min(color.r, min(color.g, color.b)); float offset = x < 0.08 ? x - 6.25 * x * x : 0.04; color -= offset;
      float peak = max(color.r, max(color.g, color.b)); if (peak < startCompression) return color;
      const float d = 1.0 - startCompression; float newPeak = 1.0 - d * d / (peak + d - startCompression); color *= newPeak / peak;
      float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0); return mix(color, vec3(newPeak), g);
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = neutral(max(c.rgb, 0.0) * exposure);
      // grade in display (gamma) space so saturation/contrast don't crush darks, then back to linear
      vec3 g = pow(max(c.rgb, 0.0), vec3(1.0 / 2.2));
      float l = dot(g, vec3(0.299, 0.587, 0.114));
      vec3 sepia = vec3(l * 1.07 + 0.02, l * 0.9 + 0.01, l * 0.7);
      // vibrance: boost dull colours more than already-vivid ones, so greens/blues don't clip into flat patches
      float chroma = max(g.r, max(g.g, g.b)) - min(g.r, min(g.g, g.b));
      float sat = 1.0 + (saturation - 1.0) * (1.0 - smoothstep(0.05, 0.55, chroma));
      vec3 graded = mix(vec3(l), g, sat);
      graded = graded / max(vec3(1.0), vec3(max(graded.r, max(graded.g, graded.b))));   // keep hue when a channel overshoots
      graded = clamp(graded, 0.0, 1.0);
      graded = (graded - 0.5) * contrast + 0.5;
      graded *= vec3(1.0 + warmth, 1.0 + warmth * 0.35, 1.0 - warmth);
      vec3 col = mix(sepia, graded, colorAmount);
      col += (hash(vUv * 731.0) - 0.5) * grain;
      col = pow(clamp(col, 0.0, 1.0), vec3(2.2));
      vec2 d = vUv - 0.5; float vig = 1.0 - dot(d, d) * (0.9 - 0.55 * colorAmount);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) * vig, c.a);
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.3, 2500);
  /** Aerial haze: distant buildings fade toward the horizon colour. */
  readonly fog = new THREE.FogExp2('#c8d9e6', 0.0036);
  private composer: EffectComposer;
  private scenePass: RenderPass;
  private sepia: ShaderPass;
  quality: 'high' | 'low' = 'high';
  private colorTarget = 0;
  colorAmount = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#a9cbe8');
    this.scene.fog = this.fog;
    this.scene.environment = this.skyEnvironment(null);      // image-based light for the physically based materials
    this.scene.environmentIntensity = 0.55;
    // The post-processing chain renders into an offscreen target, which skips the canvas's built-in
    // antialiasing. A multisampled target restores it — without it edges and window frames "crawl"
    // and flicker as the camera moves.
    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.scenePass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.scenePass);
    this.sepia = new ShaderPass(SepiaShader);
    this.composer.addPass(this.sepia);
    this.composer.addPass(new OutputPass());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  /** Prefiltered environment map made from a small sky scene (sky gradient + sun glow + ground bounce). */
  private envTex: THREE.Texture | null = null;
  private skyEnvironment(a: Atmosphere | null): THREE.Texture {
    const C = (h: string) => new THREE.Color(h);
    const sc = new THREE.Scene();
    const sun = a ? new THREE.Vector3(...a.sun).normalize() : new THREE.Vector3(50, 100, 35).normalize();
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { sun: { value: sun }, top: { value: C(a?.skyTop ?? '#3f7fc4') }, mid: { value: C(a?.skyMid ?? '#9cc3e6') }, hor: { value: C(a?.horizon ?? '#c8d9e6') },
        ground: { value: C(a?.hemiGround ?? '#5c6048') }, sunCol: { value: C(a?.sunColor ?? '#fff1d6') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 sun, top, mid, hor, ground, sunCol; varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = d.y;
        vec3 sky = mix(hor, mid, smoothstep(0.0, 0.2, h)); sky = mix(sky, top, smoothstep(0.2, 0.8, h));
        vec3 c = mix(ground, sky, smoothstep(-0.08, 0.05, h)) + sunCol * pow(max(dot(d, sun), 0.0), 64.0) * 6.0;
        gl_FragColor = vec4(c, 1.0); }`,
    })));
    const pm = new THREE.PMREMGenerator(this.renderer);
    const tex = pm.fromScene(sc, 0.02).texture; pm.dispose();
    this.envTex?.dispose(); this.envTex = tex;
    return tex;
  }
  private baseExposure = 0.72;
  /** Brightness setting (exposure multiplier). */
  setBrightness(b: number) { this.sepia.uniforms.exposure.value = this.baseExposure * b; }
  /** Era time-of-day: environment light, haze, exposure. (World sets sun, sky dome, night lights, season.) */
  setAtmosphere(a: Atmosphere) {
    this.scene.environment = this.skyEnvironment(a);
    this.scene.environmentIntensity = a.envIntensity;
    this.fog.color.set(a.fog); this.fog.density = a.fogDensity;
    this.baseExposure = a.exposure; this.setBrightness(SETTINGS.brightness);
  }
  get canvas() { return this.renderer.domElement; }
  useScene(scene: THREE.Scene | null) { this.scenePass.scene = scene ?? this.scene; }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  /** High: pixel ratio up to 1.5 + 2048 shadows. Low: pixel ratio 1 + 1024 shadows (weaker laptops).
   *  (Screen-space AO and bloom were removed: measured as the main cause of lag; the voxel AO is baked into the meshes.) */
  setQuality(q: 'high' | 'low', sun?: THREE.DirectionalLight) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 1.5 : 1));
    if (sun) { const n = q === 'high' ? 2048 : 1024; if (sun.shadow.mapSize.x !== n) { sun.shadow.mapSize.set(n, n); sun.shadow.map?.dispose(); sun.shadow.map = null; } }
    this.resize();
  }
  setColor(target: number, instant = false) { this.colorTarget = target; if (instant) this.colorAmount = target; }
  render(dt: number) {
    this.colorAmount += (this.colorTarget - this.colorAmount) * Math.min(1, dt * 0.8);
    if (Math.abs(this.colorTarget - this.colorAmount) < 0.002) this.colorAmount = this.colorTarget;
    const u = this.sepia.uniforms, L = GAME_CONFIG.look, s0 = GAME_CONFIG.colorStages[0];
    const t = Math.max(0, Math.min(1, (this.colorAmount - s0) / (1 - s0))), mix = (a: number, b: number) => a + (b - a) * t;
    u.colorAmount.value = this.colorAmount;
    u.saturation.value = mix(L.saturationStart, L.saturationEnd); u.warmth.value = mix(L.warmthStart, L.warmthEnd);
    u.contrast.value = mix(L.contrastStart, L.contrastEnd); u.grain.value = mix(L.grainStart, L.grainEnd);
    u.time.value = (u.time.value + dt) % 100;
    this.composer.render(dt);
  }
}
