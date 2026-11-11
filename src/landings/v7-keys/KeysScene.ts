import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
export { CODE_TO_KEY } from './keymap'

/** ЙЦУКЕН rows. `w` is width in key units; `id` is what typing it produces. */
export interface KeyDef {
  id: string
  label: string
  w?: number
  kind?: 'char' | 'enter' | 'space' | 'back'
}
const ROW = (s: string): KeyDef[] => [...s].map((c) => ({ id: c, label: c.toUpperCase() }))
export const LAYOUT: KeyDef[][] = [
  [...ROW('йцукенгшщзхъ'), { id: 'Backspace', label: '⌫', w: 1.6, kind: 'back' }],
  [...ROW('фывапролджэ'), { id: 'Enter', label: 'Ввод', w: 2.1, kind: 'enter' }],
  [...ROW('ячсмитьбю'), { id: '.', label: '.', w: 1 }, { id: '?', label: '?', w: 1 }],
  [{ id: ' ', label: '', w: 7, kind: 'space' }],
]

interface KeyMesh {
  def: KeyDef
  cap: Mesh
  baseY: number
  press: number
  vel: number
  glow: number
  mat: MeshStandardMaterial
  base: Color
}

export interface KeysOptions {
  quality: 'high' | 'low'
  reducedMotion: boolean
  font: string
  colors: { cap: string; capInk: string; accent: string; accentInk: string; space: string; board: string; glow: string }
}

const U = 1 // key pitch
const GAP = 0.12

export class KeysScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(30, 1, 0.1, 100)
  private board = new Group()
  private keys = new Map<string, KeyMesh>()
  private meshes: Mesh[] = []
  private disposables: { dispose(): void }[] = []
  private ray = new Raycaster()
  private pointer = new Vector2()
  private tilt = new Vector2()
  private scroll = 0
  private last = performance.now()
  private raf = 0
  private running = false
  private ro: ResizeObserver
  private canvas: HTMLCanvasElement
  private opts: KeysOptions
  private hovered: KeyMesh | null = null
  private glowColor: Color

  constructor(canvas: HTMLCanvasElement, opts: KeysOptions) {
    this.canvas = canvas
    this.opts = opts
    const high = opts.quality === 'high'
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5))
    this.renderer.setClearColor(0x000000, 0)
    this.glowColor = new Color(opts.colors.glow)

    const pmrem = new PMREMGenerator(this.renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = env
    this.disposables.push(env, pmrem)

    this.scene.add(new HemisphereLight(0xffffff, 0x8a7a66, 0.6))
    const sun = new DirectionalLight(0xffffff, 1.4)
    sun.position.set(-3, 8, 5)
    this.scene.add(sun)
    this.scene.add(this.board)

    const c = opts.colors
    const widest = Math.max(...LAYOUT.map((r) => r.reduce((s, k) => s + (k.w ?? 1), 0)))
    const depth = LAYOUT.length
    // board
    const boardGeo = new RoundedBoxGeometry(widest * U + 0.6, 0.4, depth * U + 0.6, 4, 0.18)
    const boardMat = new MeshStandardMaterial({ color: c.board, roughness: 0.55, metalness: 0.1 })
    const boardMesh = new Mesh(boardGeo, boardMat)
    boardMesh.position.y = -0.3
    this.board.add(boardMesh)
    this.disposables.push(boardGeo, boardMat)

    const geoCache = new Map<number, RoundedBoxGeometry>()
    const labelGeo = new PlaneGeometry(1, 1)
    this.disposables.push(labelGeo)
    LAYOUT.forEach((row, ri) => {
      const rowW = row.reduce((s, k) => s + (k.w ?? 1), 0)
      let x = -rowW / 2 + (ri === 1 ? 0.15 : ri === 2 ? 0.45 : 0) - (ri === 0 ? 0 : 0)
      for (const def of row) {
        const w = def.w ?? 1
        let g = geoCache.get(w)
        if (!g) {
          g = new RoundedBoxGeometry(w * U - GAP, 0.42, U - GAP, 4, 0.1)
          geoCache.set(w, g)
          this.disposables.push(g)
        }
        const color = def.kind === 'enter' ? c.accent : def.kind === 'space' || def.kind === 'back' ? c.space : c.cap
        const mat = new MeshStandardMaterial({ color, roughness: 0.42, metalness: 0, envMapIntensity: 0.9 })
        const cap = new Mesh(g, mat)
        const cx = x + w / 2
        const cz = (ri - (depth - 1) / 2) * U
        cap.position.set(cx, 0.12, cz)
        cap.userData.id = def.id
        this.board.add(cap)
        this.meshes.push(cap)
        this.disposables.push(mat)
        if (def.label) {
          const tex = this.labelTexture(def.label, def.kind === 'enter' ? c.accentInk : c.capInk, def.label.length > 1 ? 0.36 : 0.56)
          const lm = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
          const label = new Mesh(labelGeo, lm)
          label.rotation.x = -Math.PI / 2
          label.scale.set(w * U - GAP - 0.1, U - GAP - 0.1, 1)
          label.position.y = 0.211
          cap.add(label)
          this.disposables.push(tex, lm)
        }
        this.keys.set(def.id, { def, cap, baseY: 0.12, press: 0, vel: 0, glow: 0, mat, base: new Color(color) })
        x += w
      }
    })

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
  }

  private labelTexture(text: string, ink: string, size: number) {
    const s = 256
    const cv = document.createElement('canvas')
    cv.width = s * (text.length > 1 ? 2 : 1)
    cv.height = s
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = ink
    ctx.font = `500 ${s * size}px ${this.opts.font}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    // legend sits top-left like on a real keycap
    ctx.fillText(text, s * 0.14, s * 0.12)
    const tex = new CanvasTexture(cv)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }

  /** Presses a key by its id (letter, ' ', 'Enter', 'Backspace'). */
  press(id: string) {
    const k = this.keys.get(id)
    if (!k) return
    k.vel = -0.09
    k.glow = 1
  }

  /** Pointer in NDC; returns the id of the key under it (for hover/tap). */
  pick(x: number, y: number): string | null {
    this.pointer.set(x, y)
    this.ray.setFromCamera(this.pointer, this.camera)
    const hit = this.ray.intersectObjects(this.meshes, false)[0]
    return (hit?.object.userData.id as string | undefined) ?? null
  }

  setHover(id: string | null) {
    this.hovered = id ? (this.keys.get(id) ?? null) : null
  }

  setTilt(x: number, y: number) {
    this.tilt.set(x, y)
  }

  /** 0..1 — hero scroll; the board turns from a perspective view to top-down. */
  setScroll(p: number) {
    this.scroll = Math.min(Math.max(p, 0), 1)
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

  private resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.render()
  }

  private render() {
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    const steps = Math.max(1, Math.round(dt / (1 / 120)))
    for (const k of this.keys.values()) {
      // spring back to rest (sub-stepped so it stays stable at low frame rates)
      for (let i = 0; i < steps; i++) {
        const target = this.hovered === k ? -0.03 : 0
        k.vel += (target - k.press) * 0.35 - k.vel * 0.3
        k.press += k.vel
      }
      k.press = Math.max(k.press, -0.2)
      k.cap.position.y = k.baseY + k.press
      k.glow = Math.max(0, k.glow - dt * 2.2)
      k.mat.color.copy(k.base).lerp(this.glowColor, k.glow * 0.7)
    }
    // frame the board: fit its width to the viewport, camera tilts towards top-down as you scroll
    const aspect = this.camera.aspect
    // fit the whole board: far enough for its width and for its depth, whichever needs more
    const t = 2 * Math.tan((this.camera.fov * Math.PI) / 360)
    const dist = Math.max(14.8 / (t * aspect), 7.6 / t)
    const angle = (0.95 - this.scroll * 0.55) // radians from vertical
    const tx = this.opts.reducedMotion ? 0 : this.tilt.x * 0.08
    const ty = this.opts.reducedMotion ? 0 : this.tilt.y * 0.06
    this.camera.position.set(Math.sin(tx) * dist, Math.cos(angle + ty) * dist, Math.sin(angle + ty) * dist)
    this.camera.lookAt(0, -0.4, 0)
    this.board.rotation.y = aspect < 1 ? 0 : -0.06
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.stop()
    this.ro.disconnect()
    this.disposables.forEach((d) => d.dispose())
    this.renderer.dispose()
  }
}
