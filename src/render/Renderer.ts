import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GAME_CONFIG } from '../config/game.config';

/** colorAmount: 0 = full sepia (opening), 1 = full colour. Symbolic, not a time change. */
const SepiaShader = {
  uniforms: { tDiffuse: { value: null }, colorAmount: { value: 0 }, saturation: { value: 1.2 }, warmth: { value: 0.06 }, contrast: { value: 1.05 }, grain: { value: 0.03 }, time: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  // Colour side: a warm "90s photo" grade (saturation, warmth, contrast, light grain).
  fragmentShader: `uniform sampler2D tDiffuse; uniform float colorAmount, saturation, warmth, contrast, grain, time; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 sepia = vec3(l * 1.07 + 0.02, l * 0.88 + 0.01, l * 0.66);
      vec3 graded = mix(vec3(l), c.rgb, saturation);
      graded = (graded - 0.5) * contrast + 0.5;
      graded *= vec3(1.0 + warmth, 1.0 + warmth * 0.35, 1.0 - warmth);
      vec3 col = mix(sepia, graded, colorAmount);
      col += (hash(vUv * 731.0) - 0.5) * grain;
      vec2 d = vUv - 0.5; float vig = 1.0 - dot(d, d) * (0.9 - 0.55 * colorAmount);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) * vig, c.a);
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.3, 2500);
  readonly fog = new THREE.Fog('#cddde8', 320, 1600);
  private composer: EffectComposer;
  private sepia: ShaderPass;
  private colorTarget = 0;
  colorAmount = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#a9cbe8');
    this.scene.fog = this.fog;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.sepia = new ShaderPass(SepiaShader);
    this.composer.addPass(this.sepia);
    this.composer.addPass(new OutputPass());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  get canvas() { return this.renderer.domElement; }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setColor(target: number, instant = false) { this.colorTarget = target; if (instant) this.colorAmount = target; }
  render(dt: number) {
    this.colorAmount += (this.colorTarget - this.colorAmount) * Math.min(1, dt * 0.8);
    if (Math.abs(this.colorTarget - this.colorAmount) < 0.002) this.colorAmount = this.colorTarget;
    const u = this.sepia.uniforms, L = GAME_CONFIG.look;
    u.colorAmount.value = this.colorAmount; u.saturation.value = L.saturation; u.warmth.value = L.warmth; u.contrast.value = L.contrast; u.grain.value = L.grain;
    u.time.value = (u.time.value + dt) % 100;
    this.composer.render(dt);
  }
}
