import {
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three'

/**
 * Thousands of particles that assemble into Russian words.
 * Positions live in "word space" (word width = 1) and are scaled to the viewport in the shader,
 * so a resize never needs a re-sample. Each morph flies the particles through depth.
 */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uMorph;
uniform float uScale;
uniform float uPixel;
uniform float uFly;
uniform vec2 uPointer;
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec3 aDir;
attribute float aSeed;
varying float vSeed;
varying float vLift;

float ease(float x){ return x * x * (3.0 - 2.0 * x); }

void main(){
  float l = clamp((uMorph - aSeed * 0.35) / 0.65, 0.0, 1.0);
  float k = ease(l);
  vec3 p = mix(aFrom, aTo, k);
  // flight: out into depth and back
  p += aDir * sin(3.14159 * l) * uFly;
  // breathing
  p.x += sin(uTime * 0.9 + aSeed * 31.0) * 0.0025;
  p.y += cos(uTime * 0.7 + aSeed * 17.0) * 0.0025;
  vec3 w = p * uScale;
  // pointer pushes particles aside like sand
  vec2 d = w.xy - uPointer;
  float dist = length(d);
  float r = 0.55 * uScale;
  float push = smoothstep(r, 0.0, dist);
  w.xy += normalize(d + 1e-4) * push * 0.22 * uScale;
  w.z += push * 0.6;
  vLift = push + sin(3.14159 * l) * 0.6;
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_PointSize = min((1.2 + aSeed * 1.6) * (6.0 / -mv.z), 4.5) * uPixel;
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`

const FRAG = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uHot;
varying float vSeed;
varying float vLift;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.2, d);
  vec3 c = mix(uInk, uHot, clamp(step(0.965, vSeed) + vLift * 0.9, 0.0, 1.0));
  gl_FragColor = vec4(c, a);
}`

export interface WordsOptions {
  quality: 'high' | 'low'
  reducedMotion: boolean
  font: string
  ink: string
  hot: string
}

export class WordsScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(35, 1, 0.1, 100)
  private mat: ShaderMaterial
  private geo = new BufferGeometry()
  private points: Points
  private from: Float32Array
  private to: Float32Array
  private dir: Float32Array
  private seed: Float32Array
  private count: number
  private morph = 1
  private morphStart = -1e9
  private t0 = performance.now()
  private pointer = new Vector2(99, 99)
  private pointerTarget = new Vector2(99, 99)
  private tilt = new Vector2()
  private raf = 0
  private running = false
  private ro: ResizeObserver
  private canvas: HTMLCanvasElement
  private opts: WordsOptions
  private sampler = document.createElement('canvas')

  constructor(canvas: HTMLCanvasElement, opts: WordsOptions) {
    this.canvas = canvas
    this.opts = opts
    const high = opts.quality === 'high'
    this.count = high ? 14000 : 6500
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5))
    this.renderer.setClearColor(0x000000, 0)
    this.camera.position.set(0, 0, 6)

    const n = this.count
    this.from = new Float32Array(n * 3)
    this.to = new Float32Array(n * 3)
    this.dir = new Float32Array(n * 3)
    this.seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      // start as a loose cloud
      this.from.set([(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.4], i * 3)
      this.to.set(this.from.subarray(i * 3, i * 3 + 3), i * 3)
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(Math.random() * 2 - 1)
      this.dir.set([Math.sin(ph) * Math.cos(th) * 0.35, Math.sin(ph) * Math.sin(th) * 0.25, Math.abs(Math.cos(ph)) * 0.25 + 0.05], i * 3)
      this.seed[i] = Math.random()
    }
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    this.geo.setAttribute('aFrom', new BufferAttribute(this.from, 3))
    this.geo.setAttribute('aTo', new BufferAttribute(this.to, 3))
    this.geo.setAttribute('aDir', new BufferAttribute(this.dir, 3))
    this.geo.setAttribute('aSeed', new BufferAttribute(this.seed, 1))
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 1 },
        uScale: { value: 4 },
        uPixel: { value: this.renderer.getPixelRatio() },
        uFly: { value: opts.reducedMotion ? 0 : 1 },
        uPointer: { value: this.pointer },
        uInk: { value: new Color(opts.ink) },
        uHot: { value: new Color(opts.hot) },
      },
    })
    this.points = new Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.scene.add(this.points)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
  }

  /** Samples the word's glyphs and sends every particle to a pixel of it. */
  setWord(word: string) {
    const targets = this.sample(word)
    const n = this.count
    // freeze current in-flight positions as the new start
    const m = this.morph
    for (let i = 0; i < n; i++) {
      const l = Math.min(Math.max((m - this.seed[i]! * 0.35) / 0.65, 0), 1)
      const k = l * l * (3 - 2 * l)
      const fly = Math.sin(Math.PI * l) * (this.opts.reducedMotion ? 0 : 1)
      for (let j = 0; j < 3; j++) {
        const a = this.from[i * 3 + j]!
        const b = this.to[i * 3 + j]!
        this.from[i * 3 + j] = a + (b - a) * k + this.dir[i * 3 + j]! * fly
      }
      const t = targets[i % targets.length]!
      this.to[i * 3] = t[0] + (Math.random() - 0.5) * 0.002
      this.to[i * 3 + 1] = t[1] + (Math.random() - 0.5) * 0.002
      this.to[i * 3 + 2] = (Math.random() - 0.5) * 0.05
    }
    ;(this.geo.getAttribute('aFrom') as BufferAttribute).needsUpdate = true
    ;(this.geo.getAttribute('aTo') as BufferAttribute).needsUpdate = true
    this.morph = this.opts.reducedMotion ? 1 : 0
    this.morphStart = this.opts.reducedMotion ? -1e9 : performance.now()
    if (!this.running) this.render()
  }

  private sample(word: string): [number, number][] {
    const W = 1200
    const H = 420
    const c = this.sampler
    c.width = W
    c.height = H
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.clearRect(0, 0, W, H)
    let size = 300
    ctx.font = `400 ${size}px ${this.opts.font}`
    const w = ctx.measureText(word).width
    size = Math.min(300, (size * W * 0.94) / Math.max(w, 1))
    ctx.font = `400 ${size}px ${this.opts.font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.fillText(word, W / 2, H / 2 + size * 0.04)
    const data = ctx.getImageData(0, 0, W, H).data
    const pts: [number, number][] = []
    const step = 3
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        if (data[(y * W + x) * 4 + 3]! > 140) pts.push([(x - W / 2) / W, -(y - H / 2) / W])
      }
    }
    // shuffle so repeated targets spread evenly over the glyphs
    for (let i = pts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[pts[i], pts[j]] = [pts[j]!, pts[i]!]
    }
    return pts.length ? pts : [[0, 0]]
  }

  /** Pointer in NDC (-1..1). */
  setPointer(x: number, y: number) {
    const h = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z
    this.pointerTarget.set((x * h * this.camera.aspect) / 2, (y * h) / 2)
    this.tilt.set(x, y)
  }

  clearPointer() {
    this.pointerTarget.set(99, 99)
    this.tilt.set(0, 0)
  }

  start() {
    if (this.running) return
    this.running = true
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

  private resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const visH = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z
    const visW = visH * this.camera.aspect
    // word width: most of the screen width, but never taller than ~40% of it
    this.mat.uniforms.uScale!.value = Math.min(visW * 0.9, visH * 1.25)
    // the word sits above centre, leaving the lower third of the screen for the headline
    this.points.position.y = visH * (this.camera.aspect < 0.8 ? 0.14 : 0.1)
    this.render()
  }

  private render() {
    // wall-clock timing: the morph finishes on time even when frames are throttled
    const now = performance.now()
    this.morph = Math.min((now - this.morphStart) / 1700, 1)
    // pointer jumps in from "far away" instead of sweeping across the screen
    if (this.pointer.x > 50 && this.pointerTarget.x < 50) this.pointer.copy(this.pointerTarget)
    else this.pointer.lerp(this.pointerTarget, 0.12)
    this.mat.uniforms.uTime!.value = (now - this.t0) / 1000
    this.mat.uniforms.uMorph!.value = this.morph
    this.points.rotation.y += (this.tilt.x * 0.22 - this.points.rotation.y) * 0.04
    this.points.rotation.x += (-this.tilt.y * 0.14 - this.points.rotation.x) * 0.04
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.stop()
    this.ro.disconnect()
    this.geo.dispose()
    this.mat.dispose()
    this.renderer.dispose()
  }
}
