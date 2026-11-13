import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  IcosahedronGeometry,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/** Ashima 3D simplex noise (MIT) */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`

const CORE_VERT = /* glsl */ `
${NOISE}
uniform float uTime;
uniform float uScroll;
uniform vec2 uPointer;
uniform vec3 uPulseDir;
uniform float uPulseAge;
varying float vDisp;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;

float field(vec3 p){
  float t = uTime * 0.22;
  float n = snoise(p * 1.05 + vec3(t, t * 0.6, -t));
  float n2 = snoise(p * 2.0 - vec3(0.0, t * 1.3, t)) * 0.1;
  float pull = dot(normalize(p), normalize(vec3(uPointer, 0.9))) * 0.14;
  // click ripple: a ring travelling across the surface from the clicked point
  float k = acos(clamp(dot(normalize(p), uPulseDir), -1.0, 1.0));
  float ring = sin(k * 7.0 - uPulseAge * 8.0) * exp(-uPulseAge * 1.4) * smoothstep(uPulseAge * 1.25 + 0.4, uPulseAge * 1.25 - 0.4, k);
  return (n + n2) * (0.16 + uScroll * 0.1) + pull + ring * 0.11;
}
vec3 displace(vec3 p){
  return p + normalize(p) * field(p);
}
void main(){
  vec3 p = position;
  vec3 n = normalize(p);
  vec3 tang = normalize(abs(n.y) > 0.99 ? cross(n, vec3(1.0, 0.0, 0.0)) : cross(n, vec3(0.0, 1.0, 0.0)));
  vec3 bit = cross(n, tang);
  float r = length(p);
  float e = 0.012;
  vec3 p0 = displace(p);
  vec3 p1 = displace(normalize(p + tang * e) * r);
  vec3 p2 = displace(normalize(p + bit * e) * r);
  vec3 dn = normalize(cross(p1 - p0, p2 - p0));
  vDisp = field(p);
  vec4 mv = modelViewMatrix * vec4(p0, 1.0);
  vNormal = normalize(normalMatrix * dn);
  vView = normalize(-mv.xyz);
  vWorld = p0;
  gl_Position = projectionMatrix * mv;
}`

const CORE_FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uHot;
uniform vec3 uGold;
uniform vec3 uRim;
uniform float uTime;
varying float vDisp;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  vec3 L = normalize(vec3(-0.6, 0.8, 0.7));
  vec3 L2 = normalize(vec3(0.9, -0.4, 0.3));
  float diff = max(dot(N, L), 0.0);
  float back = max(dot(N, L2), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 48.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  float heat = smoothstep(-0.05, 0.32, vDisp);
  vec3 base = mix(uDeep, uHot, heat * heat * 0.85);
  vec3 lava = uHot * smoothstep(0.12, 0.34, vDisp) * 0.55 + uGold * smoothstep(0.28, 0.42, vDisp) * 0.35;
  // thin-film iridescence on grazing angles
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (fres * 1.3 + vec3(0.0, 0.33, 0.67)) + uTime * 0.3);
  vec3 col = base * (0.28 + diff * 0.95) + uRim * back * 0.25;
  col += lava;
  col += spec * vec3(1.0, 0.93, 0.85) * 1.1;
  col += mix(uRim, irid, 0.55) * fres * 0.75;
  gl_FragColor = vec4(col, 1.0);
}`

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uPixel;
attribute float aSize;
attribute float aSeed;
varying float vAlpha;
varying float vSeed;
void main(){
  vec3 p = position;
  float a = uTime * (0.04 + aSeed * 0.05);
  float c = cos(a), s = sin(a);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p.y += sin(uTime * 0.6 + aSeed * 40.0) * 0.04;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPixel * (7.0 / -mv.z);
  vAlpha = 0.35 + 0.65 * fract(aSeed * 13.7 + uTime * 0.05);
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`

const DUST_FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uFade;
varying float vAlpha;
varying float vSeed;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(uA, uB, vSeed), a * vAlpha * uFade);
}`

export interface NebulaOptions {
  quality: 'high' | 'low'
  reducedMotion: boolean
  /** Clear colour; the canvas is transparent, so this only tints the cleared alpha-0 buffer. */
  clear?: string
  palette?: { deep: string; hot: string; light: string; rim: string; dustA: string; dustB: string }
}

export class NebulaScene {
  private renderer: WebGLRenderer
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private scene = new Scene()
  private camera = new PerspectiveCamera(38, 1, 0.1, 100)
  private last = performance.now()
  private group = new Group()
  private coreMat: ShaderMaterial
  private dustMat: ShaderMaterial
  private disposables: { dispose(): void }[] = []
  private pointer = new Vector2()
  private pointerTarget = new Vector2()
  private scroll = 0
  private pulseAt = -99
  private elapsed = 0
  private bornAt = -1
  private energy = 0
  private energyTarget = 0
  private raf = 0
  private running = false
  private ro: ResizeObserver

  private canvas: HTMLCanvasElement
  private opts: NebulaOptions

  constructor(canvas: HTMLCanvasElement, opts: NebulaOptions) {
    this.canvas = canvas
    this.opts = opts
    const high = opts.quality === 'high'
    // Transparent canvas: the page behind it shows through, so a cleared buffer (resize, first frame,
    // tab switch) never flashes black — the backdrop is a CSS layer the host fades in.
    this.renderer = new WebGLRenderer({ canvas, antialias: !high, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1.5))
    this.renderer.setClearColor(new Color(opts.clear ?? '#000000'), 0)

    this.camera.position.set(0, 0, 7.2)
    this.scene.add(this.group)

    // Core: noise-displaced sphere with fresnel rim
    const coreGeo = new IcosahedronGeometry(1.15, high ? 40 : 20)
    this.coreMat = new ShaderMaterial({
      vertexShader: CORE_VERT,
      fragmentShader: CORE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uPointer: { value: this.pointer },
        uPulseDir: { value: new Vector3(0, 0, 1) },
        uPulseAge: { value: 99 },
        uDeep: { value: new Color(opts.palette?.deep ?? '#1b1220') },
        uHot: { value: new Color(opts.palette?.hot ?? '#ff5a2a') },
        uGold: { value: new Color(opts.palette?.light ?? '#ffd9a0') },
        uRim: { value: new Color(opts.palette?.rim ?? '#7fe7ff') },
      },
    })
    const core = new Mesh(coreGeo, this.coreMat)
    this.group.add(core)

    // Dust: spiral disc + far stars
    const count = high ? 6000 : 2200
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const far = i % 5 === 0
      const r = far ? 6 + Math.random() * 14 : 2.1 + Math.pow(Math.random(), 1.6) * 3.6
      const arm = (i % 3) * ((Math.PI * 2) / 3)
      const theta = far ? Math.random() * Math.PI * 2 : arm + r * 0.9 + (Math.random() - 0.5) * 0.9
      const y = far ? (Math.random() - 0.5) * 16 : (Math.random() - 0.5) * 0.35 * (1 + r * 0.15)
      pos.set([Math.cos(theta) * r, y, Math.sin(theta) * r], i * 3)
      size[i] = far ? 0.6 + Math.random() * 1.2 : 0.8 + Math.random() * 2.4
      seed[i] = Math.random()
    }
    const dustGeo = new BufferGeometry()
    dustGeo.setAttribute('position', new BufferAttribute(pos, 3))
    dustGeo.setAttribute('aSize', new BufferAttribute(size, 1))
    dustGeo.setAttribute('aSeed', new BufferAttribute(seed, 1))
    this.dustMat = new ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixel: { value: this.renderer.getPixelRatio() },
        uFade: { value: 1 },
        uA: { value: new Color(opts.palette?.dustA ?? '#ff8a4c') },
        uB: { value: new Color(opts.palette?.dustB ?? '#9fe9ff') },
      },
    })
    const dust = new Points(dustGeo, this.dustMat)
    dust.rotation.x = 0.42
    dust.rotation.z = -0.18
    this.group.add(dust)

    this.disposables.push(coreGeo, this.coreMat, dustGeo, this.dustMat)

    if (high) {
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.55, 0.5, 0.62)
      this.composer.addPass(this.bloom)
      this.composer.addPass(new OutputPass())
    }

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
  }

  setPointer(x: number, y: number) {
    this.pointerTarget.set(x, y)
  }

  /** Sends a ripple from the given screen point (NDC -1..1) across the orb. */
  pulse(x: number, y: number) {
    const dir = new Vector3(x, y, 0.9).normalize()
    dir.applyQuaternion(this.group.quaternion.clone().invert())
    ;(this.coreMat.uniforms.uPulseDir!.value as Vector3).copy(dir)
    this.pulseAt = this.elapsed
  }

  /** 0..1 — how agitated the orb is (e.g. while an answer streams). */
  setEnergy(e: number) {
    this.energyTarget = e
  }

  setScroll(p: number) {
    this.scroll = Math.min(Math.max(p, 0), 1)
  }

  /** 0..1 — how dark the backdrop is. Dust and bloom are meant for the dark; on the light page they fade out. */
  setNight(v: number) {
    const n = Math.min(Math.max(v, 0), 1)
    this.dustMat.uniforms.uFade!.value = n
    if (this.bloom) {
      this.bloom.strength = 0.55 * n
      this.bloom.enabled = n > 0.01
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const tick = () => {
      if (!this.running) return
      this.render()
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  renderOnce() {
    this.render()
  }

  private resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h)
    this.camera.aspect = w / h
    // Keep sphere framed on portrait phones
    this.camera.position.z = w < h ? 9.6 : 7.2
    this.camera.updateProjectionMatrix()
    // setSize clears the drawing buffer — redraw now, not on the next frame, to avoid an empty flash
    this.render()
  }

  private render() {
    const speed = this.opts.reducedMotion ? 0.15 : 1
    const now = performance.now()
    this.elapsed += Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    const raw = this.elapsed
    if (this.bornAt < 0) this.bornAt = now
    this.energy += (this.energyTarget - this.energy) * 0.05
    const t = raw * speed * (1 + this.energy * 1.5)
    // intro: the orb grows out of nothing with a soft overshoot
    // intro runs on wall-clock time so it never stalls on a throttled tab
    const a = Math.min((now - this.bornAt) / 1800, 1)
    const intro = this.opts.reducedMotion ? 1 : 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2)
    this.coreMat.uniforms.uPulseAge!.value = raw - this.pulseAt
    this.pointer.lerp(this.pointerTarget, 0.05)
    this.coreMat.uniforms.uTime!.value = t
    this.coreMat.uniforms.uScroll!.value = this.scroll
    this.dustMat.uniforms.uTime!.value = t

    this.group.rotation.y = t * 0.08 + this.pointer.x * 0.35
    this.group.rotation.x = this.pointer.y * 0.2 + this.scroll * 0.35
    // scroll 0 → orb sized for the small frame; 1 → frame fills the screen
    const s = (0.5 + this.scroll * 0.6) * Math.max(intro, 0.001)
    this.group.scale.setScalar(s)

    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.stop()
    this.ro.disconnect()
    this.disposables.forEach((d) => d.dispose())
    this.composer?.dispose()
    this.renderer.dispose()
  }
}
