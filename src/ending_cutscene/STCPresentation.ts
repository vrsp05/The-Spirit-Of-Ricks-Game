import * as THREE from 'three';
import { CutsceneAvatar as Avatar, type AvatarLook } from './CutsceneAvatar';
import { block, type EndingStage } from './EndingStage';

const smooth = THREE.MathUtils.smoothstep;

/** STC atrium presentation, staged from presenting_stage_reference.jpg. */
export class STCPresentation {
  readonly scene = new THREE.Scene();
  readonly presenters: { id: string; avatar: Avatar }[] = [];
  readonly audience: Avatar[] = [];
  readonly screen = new THREE.Group();
  readonly screenCenter = new THREE.Vector3(0, 5.9, -10);
  readonly screenWidth = 10.24;
  readonly screenHeight = 5.76;
  private feed = new THREE.WebGLRenderTarget(1280, 720, { depthBuffer: true });
  private feedCamera = new THREE.PerspectiveCamera(55, 16 / 9, .3, 200);
  private titleMaterial: THREE.MeshBasicMaterial;
  private titleAspect = 16 / 9;

  constructor() {
    const scene = this.scene;
    scene.background = new THREE.Color('#c9ced2');
    scene.add(new THREE.HemisphereLight('#e6efff', '#555a68', 1.65));
    const key = new THREE.DirectionalLight('#fff2dc', 2.1); key.position.set(2, 13, 7);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -16; key.shadow.camera.right = 16; key.shadow.camera.top = 18; key.shadow.camera.bottom = -18;
    key.shadow.normalBias = .08; scene.add(key);
    const fill = new THREE.DirectionalLight('#86baff', .8); fill.position.set(-10, 7, -5); scene.add(fill);
    // Gray carpet, pale panel walls, glass classrooms and upper gallery from the reference.
    block(scene, 29, .35, 52, '#777a7e', 0, -.2, 0);
    for (let z = -24; z <= 24; z += 4) block(scene, 29, .012, .045, '#676c72', 0, -.019, z);
    block(scene, 29, 12.8, .45, '#dedbd3', 0, 6.4, -25.5);
    block(scene, .45, 12.8, 52, '#ddd9d0', -14.5, 6.4, 0);
    for (const y of [3.7, 7.4, 11.1]) block(scene, .025, .035, 52, '#aaa9a5', -14.25, y, 0);
    for (let z = -22; z < 25; z += 5) block(scene, .025, 12.8, .035, '#b9b7af', -14.25, 6.4, z);
    block(scene, .08, .10, 40, '#c6c5bd', -14.18, 1.4, 2);
    const ceiling = block(scene, 29, .2, 52, '#d5d7d6', 0, 12.8, 0); ceiling.castShadow = false;
    for (const z of [-20, -12, -4, 4, 12, 20]) {
      block(scene, 29, .3, .45, '#c4c6c7', 0, 12.35, z);
      for (const x of [-7, 7]) block(scene, 8, .07, .20, '#fff7dc', x, 12.1, z, true);
    }
    const glass = new THREE.Group(); glass.name = 'atrium-glass-rooms'; scene.add(glass);
    const glazing = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhysicalMaterial({ color: '#adc6d1', transparent: true, opacity: .17, roughness: .12, metalness: .10, depthWrite: false }));
      mesh.position.set(x, y, z); parent.add(mesh);
    };
    for (let z = -22; z < 24; z += 4) {
      glazing(glass, .05, 8.5, 3.8, 14.35, 4.3, z + 2);
      block(glass, .18, 8.7, .14, '#424a50', 14.3, 4.35, z);
      block(glass, .14, .15, 4, '#424a50', 14.3, 5.4, z + 2);
      block(scene, 3, .1, 3.7, '#a5a9aa', 16, -.02, z + 2);
      if (z % 8 === -6 || z % 8 === 2) block(glass, .12, 4.6, 1.3, '#b98b58', 14.26, 2.3, z + 1);
    }
    const stairs = new THREE.Group(); stairs.name = 'atrium-stairs'; scene.add(stairs);
    for (let i = 0; i < 17; i++) {
      const h = (i + 1) * .55;
      block(stairs, 5, h, .72, '#a9adaf', 10.7, h / 2, -10.2 - i * .7);
      block(stairs, .10, 1.2, .10, '#444d54', 13.25, h + .6, -10.2 - i * .7);
    }
    block(scene, 29, .3, 4, '#d5d6d2', 0, 9.35, -23.4);
    block(scene, 4.6, .3, 35, '#d5d6d2', 12.2, 9.35, -3.9);
    const gallery = new THREE.Group(); gallery.name = 'atrium-gallery'; scene.add(gallery);
    for (let x = -12; x <= 7; x += 3.2) {
      glazing(gallery, 3.05, 1.2, .035, x, 10.1, -21.25);
      block(gallery, .065, 1.3, .065, '#586268', x - 1.57, 10.1, -21.25);
    }
    for (let z = -19; z < 13; z += 3.2) {
      glazing(gallery, .035, 1.2, 3.05, 9.85, 10.1, z);
      block(gallery, .065, 1.3, .065, '#586268', 9.85, 10.1, z - 1.57);
    }
    // Low dark riser and portable screen; the open atrium remains visible behind them.
    block(scene, 20, .6, 8, '#4b5057', 0, .3, -6.3);
    block(scene, 20, .08, .12, '#8f9499', 0, .65, -2.25);
    for (let i = 0; i < 3; i++) block(scene, 2, .2 * (i + 1), .5, '#687b8e', 9, .1 * (i + 1), -.95 - i * .5);
    // Screen is a live render of the same ceremony, with its final title layered above.
    this.screen.name = 'stc-big-screen'; this.screen.position.copy(this.screenCenter); scene.add(this.screen);
    block(this.screen, this.screenWidth + .45, this.screenHeight + .45, .20, '#17202b', 0, 0, -.15);
    for (const x of [-5.25, 5.25]) {
      block(scene, .14, 2.4, .14, '#272d34', x, 1.7, -10.05);
      block(scene, .85, .12, 1.2, '#272d34', x, .67, -10.05);
    }
    const display = new THREE.Mesh(new THREE.PlaneGeometry(this.screenWidth, this.screenHeight), new THREE.MeshBasicMaterial({ map: this.feed.texture }));
    display.name = 'ceremony-video'; this.screen.add(display);
    this.titleMaterial = new THREE.MeshBasicMaterial({ map: this.titleTexture(), transparent: true, depthWrite: false });
    const title = new THREE.Mesh(new THREE.PlaneGeometry(this.screenWidth, this.screenHeight), this.titleMaterial);
    title.name = 'screen-final-title'; title.position.z = .015; this.screen.add(title);
    const signCanvas = document.createElement('canvas'); signCanvas.width = 1536; signCanvas.height = 96;
    const signContext = signCanvas.getContext('2d')!;
    signContext.fillStyle = '#173e64'; signContext.fillRect(0, 0, 1536, 96);
    signContext.strokeStyle = '#d5b779'; signContext.lineWidth = 5; signContext.strokeRect(3, 3, 1530, 90);
    signContext.fillStyle = '#fff6df'; signContext.font = 'bold 49px sans-serif'; signContext.textAlign = 'left'; signContext.textBaseline = 'middle';
    signContext.fillText('BYUI iHack 2026', 48, 49, 1450);
    const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace;
    const roomSign = new THREE.Mesh(new THREE.PlaneGeometry(15, .85), new THREE.MeshBasicMaterial({ map: signTexture }));
    roomSign.scale.setScalar(.72); roomSign.position.set(-6.8, 7.8, -25.25); scene.add(roomSign);
    // Speaker tripod, projector table, green vending machines and department banner.
    const speaker = new THREE.Group(); speaker.name = 'stage-speaker-tripod'; scene.add(speaker);
    block(speaker, 1.15, 2, .8, '#262e35', 7.3, 4.0, -6.8);
    block(speaker, .12, 2.3, .12, '#30383e', 7.3, 1.85, -6.8);
    for (const dx of [-.65, .65]) block(speaker, .12, .12, 1.2, '#30383e', 7.3 + dx, .68, -6.8);
    block(scene, 4.1, .16, 1.65, '#ccb991', -10.9, 1.3, -2.9);
    for (const x of [-12.5, -9.3]) block(scene, .12, 1.25, 1.2, '#3b4249', x, .62, -2.9);
    block(scene, .9, .30, .65, '#e8e6dc', -11.7, 1.52, -2.8);
    block(scene, .18, .14, .035, '#86b8d4', -11.7, 1.55, -3.14, true);
    block(scene, 1.1, .06, .7, '#242c34', -10.1, 1.42, -2.8);
    block(scene, 1.05, .7, .06, '#293945', -10.1, 1.79, -3.1);
    for (const x of [3.8, 6.3]) {
      block(scene, 2.1, 4.1, 1.4, '#406b3b', x, 2.05, -14.9);
      block(scene, 1.6, 3.3, .04, '#b3cc8a', x, 2.2, -14.17);
      block(scene, 1.3, 2.4, .045, '#273a43', x - .07, 2.2, -14.14);
      for (const yy of [1.5, 2.2, 2.9]) for (const dx of [-.4, 0, .4]) block(scene, .23, .32, .05, '#d5e3ba', x + dx, yy, -14.10);
    }
    const bannerCanvas = document.createElement('canvas'); bannerCanvas.width = 512; bannerCanvas.height = 1024;
    const bc = bannerCanvas.getContext('2d')!; bc.fillStyle = '#18364b'; bc.fillRect(0, 0, 512, 1024);
    bc.fillStyle = '#fff8ed'; bc.textAlign = 'center'; bc.font = 'bold 49px sans-serif';
    ['COMPUTER', 'SCIENCE &', 'ENGINEERING', 'DEPARTMENT'].forEach((line, i) => bc.fillText(line, 256, 95 + i * 65));
    for (let i = 0; i < 4; i++) { bc.fillStyle = i % 2 ? '#d3dfdf' : '#9ab5bd'; bc.fillRect(42, 410 + i * 115, 428, 88); }
    bc.fillStyle = '#f4ead4'; bc.font = 'bold 38px sans-serif'; bc.fillText('BYU–IDAHO', 256, 957);
    const bannerTexture = new THREE.CanvasTexture(bannerCanvas); bannerTexture.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5.6), new THREE.MeshBasicMaterial({ map: bannerTexture }));
    banner.name = 'department-banner'; banner.position.set(10.4, 3.4, -7.8); scene.add(banner);
    block(scene, 3.0, .12, .65, '#555d64', 10.4, .63, -7.8);
    const glow = new THREE.PointLight('#81afff', 15, 16, 2); glow.position.set(0, 6, -7); scene.add(glow);
    // The four portraits guide hair, glasses and beard. Names remain internal IDs only.
    const team: { id: string; skin: string; hair: string; hairStyle: AvatarLook['hairStyle']; glasses?: AvatarLook['glasses']; beard?: boolean; height: number }[] = [
      { id: 'daniel', skin: '#d6aa85', hair: '#201b1c', hairStyle: 'cropped', height: .99 },
      { id: 'giovanni', skin: '#e0b590', hair: '#352820', hairStyle: 'quiff', glasses: 'dark', height: 1.03 },
      { id: 'seth', skin: '#ddb994', hair: '#242122', hairStyle: 'textured', glasses: 'gold', height: 1.00 },
      { id: 'victor', skin: '#b6815f', hair: '#29221f', hairStyle: 'curly', beard: true, height: 1.04 },
    ];
    team.forEach((person, i) => {
      const avatar = new Avatar({ ...person, shirt: '#155bd2', pants: i === 1 ? '#303440' : '#242a34', shoes: '#e1e4df', mouth: true, shortSleeves: true, emblem: 'floppy', expression: 'happy' });
      avatar.root.name = person.id; avatar.root.scale.setScalar(person.height * 1.15);
      avatar.root.position.set(-4.2 + i * 2.8, .6, -4.25); scene.add(avatar.root); this.presenters.push({ id: person.id, avatar });
    });
    // A central aisle leaves an unobstructed view from the audience to the presenters.
    const xs = [-7.3, -5.0, -2.7, 2.7, 5.0, 7.3];
    for (let row = 0; row < 4; row++) xs.forEach((x, col) => {
      const z = .8 + row * 3.0;
      const chair = new THREE.Group(); chair.position.set(x, 0, z); scene.add(chair);
      block(chair, .85, .18, .85, '#7a8187', 0, .65, 0);
      block(chair, .88, .95, .16, '#7a8187', 0, 1.15, .48);
      for (const side of [-.32, .32]) block(chair, .08, .6, .65, '#414a57', side, .3, .05);
      const avatar = new Avatar({ shirt: ['#52799a', '#e6ded0', '#38637e', '#8c6472'][(row + col) % 4], pants: '#343f4e', hair: ['#3b2b22', '#7b5636', '#27262b'][(row + col) % 3], skin: ['#d5aa85', '#ab7756', '#e8c5a4'][(row * 2 + col) % 3] }, .93);
      avatar.sit(true); avatar.root.position.set(x, -.02, z); avatar.root.rotation.y = Math.PI;
      scene.add(avatar.root); this.audience.push(avatar);
    });
    this.feedCamera.position.set(15, 13, 31); this.feedCamera.lookAt(0, 9.5, -1);
  }

  private titleTexture(aspect = 16 / 9) {
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#07162c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Only the central portion of this widescreen display is visible in a close portrait view.
    const width = 1920 * Math.min(1, aspect / (16 / 9)) * .86;
    ctx.fillStyle = '#cbb896'; ctx.font = '23px sans-serif'; ctx.letterSpacing = '6px';
    const small = Math.min(1, width / ctx.measureText('THE LEGACY CONTINUES.').width);
    ctx.font = `${23 * small}px sans-serif`; ctx.letterSpacing = `${6 * small}px`;
    ctx.fillText('THE LEGACY CONTINUES.', 960, 490);
    ctx.fillStyle = '#fff2d5'; ctx.font = '110px Georgia, serif'; ctx.letterSpacing = '4px';
    const large = Math.min(1, width / ctx.measureText('The Spirit of Ricks').width);
    ctx.font = `${110 * large}px Georgia, serif`; ctx.letterSpacing = `${4 * large}px`;
    ctx.fillText('The Spirit of Ricks', 960, 550 + 30 * large);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  update(t: number, renderer: THREE.WebGLRenderer, ceremony: EndingStage) {
    // Hold the title at full frame, then reveal the room in a single camera move.
    this.titleMaterial.opacity = 1 - smooth(t, 32.5, 33.5);
    this.presenters.forEach(({ avatar }, i) => {
      const excitement = smooth(t, 31.8, 33.7);
      avatar.cheer(t + i * .7, excitement);
      avatar.root.position.y = .6 + Math.abs(Math.sin(t * 4.8 + i * 1.1)) * .15 * excitement;
      avatar.root.rotation.y = Math.sin(t * .7 + i) * .07;
      avatar.root.rotation.z = Math.sin(t * 3 + i) * .025 * excitement;
      avatar.mouthOpen(0);
    });
    this.audience.forEach((avatar, i) => {
      if (t > 35 && i % 5 === 1) avatar.wave(t * .7 + i);
      else avatar.poseArms(-.65, -.65, 0, 0);
    });
    if (this.titleMaterial.opacity < 1) {
      ceremony.update(t);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(this.feed); renderer.clear(); renderer.render(ceremony.scene, this.feedCamera); renderer.setRenderTarget(previous);
    }
  }

  /** Start close enough that the screen covers every viewport, including portrait. */
  frame(camera: THREE.PerspectiveCamera, t: number) {
    if (this.titleAspect !== camera.aspect) {
      this.titleAspect = camera.aspect; this.titleMaterial.map?.dispose();
      this.titleMaterial.map = this.titleTexture(camera.aspect);
    }
    const p = smooth(t, 30.2, 37.7);
    const halfHeight = Math.min(this.screenHeight / 2, this.screenWidth / (2 * camera.aspect));
    const distance = halfHeight / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .995;
    const start = this.screenCenter.clone().add(new THREE.Vector3(0, 0, distance));
    const aim = this.screenCenter.clone().lerp(new THREE.Vector3(0, 4, -5), p);
    const end = new THREE.Vector3(0, 7, 17.5);
    // This distance fits the team in portrait already; only extremely thin windows need more room.
    end.sub(new THREE.Vector3(0, 4, -5)).multiplyScalar(Math.max(1, .54 / camera.aspect)).add(new THREE.Vector3(0, 4, -5));
    camera.position.copy(start.lerp(end, p)); camera.lookAt(aim);
  }
}
