import * as React from 'react'

import { cn } from '@/lib/utils'

export type GridPulseProps = Omit<React.ComponentPropsWithoutRef<'div'>, 'children'> & {
  /** Cell size in px. The hairlines and the lit cells share it. */
  cell?: number
  /** How far from the pointer a cell can still catch light, in cells. */
  reach?: number
  /** How many cells light on their own each beat, so the grid is never dead. */
  ambient?: number
  /** A lid, so a fast sweep cannot light the whole field at once. */
  maxLit?: number
  /**
   * Elements whose lines of text the light holds back from, looked up
   * inside the grid's parent.
   *
   * The selector should reach the elements that carry the words. The grid
   * measures a range over each match's contents, and a range that spans
   * block children reports one rectangle per child — its padding included
   * — rather than one per line. Marking a section, or a card, or any other
   * wrapper therefore dims a far larger area than the text it protects, so
   * a page-wide layer names paragraph, heading, list-item, link and span
   * level elements instead.
   */
  avoid?: string
}

/** The colours the field turns through, in the order the hue wheel runs, so
 *  a cell landing between two of them takes the short way round rather than
 *  crossing the wheel. Every entry is a palette colour kept at its own hue:
 *  amber 38, mint 160, cyan 190, blue 215, violet 262, magenta 290,
 *  rose 350, and back to amber.
 *
 *  The supplied component swept one narrow band; this is the full spectrum.
 *  A cell's place on it is measured against the pointer and the visible
 *  screen — see `tone` — never against absolute document rows, because the
 *  page-level field is hundreds of rows tall and a screen shows thirty of
 *  them. A ramp over rows therefore kept only a sliver of the wheel in view
 *  at a time, which is what made the grid read as plain blue. */
const SPECTRUM = [
  { h: 38, s: 92, l: 50 }, // #f59e0b warm amber
  { h: 160, s: 84, l: 39 }, // #10b981 emerald mint
  { h: 190, s: 100, l: 42 }, // #00b4d8 sky cyan
  { h: 215, s: 100, l: 50 }, // #006bff signal blue
  { h: 262, s: 83, l: 58 }, // #7c3aed violet indigo
  { h: 290, s: 100, l: 68 }, // #e55cff electric magenta
  { h: 350, s: 89, l: 60 }, // #f43f5e coral rose
]

/** The colour sitting at position `t` around that loop, wrapping through 1. */
function blend(t: number) {
  const wrapped = ((t % 1) + 1) % 1
  const at = wrapped * SPECTRUM.length
  const i = Math.floor(at) % SPECTRUM.length
  const j = (i + 1) % SPECTRUM.length
  const a = SPECTRUM[i]
  const b = SPECTRUM[j]
  const k = at - Math.floor(at)
  // Always the forward arc: on the last segment the wheel is turning past
  // 360 back to amber, and a raw subtraction would run it backwards.
  const arc = (((b.h - a.h) % 360) + 360) % 360
  return { h: a.h + arc * k, s: a.s + (b.s - a.s) * k, l: a.l + (b.l - a.l) * k }
}

/** The brightest a cell gets. Below about a fifth the sweep is a rumour;
 *  past a third the cells read as blocks and compete with the content. */
const PEAK = 0.3
/** The rim is brighter than the wash it borders, which is what makes a lit
 *  cell read as glowing instead of as a flat square. */
const RIM = 0.48
const RIM_LIFT = 15
/** How much of the spectrum a drag crosses, in turns per cell travelled. */
const TURN_PER_CELL = 0.05

/**
 * Lightness nudges, in percent, applied to whichever colour a cell takes, so
 * a sweep reads as a field of tints rather than one flat colour. The supplied
 * component used an absolute ladder here; with a spectrum each hue brings its
 * own base, so the variation is a nudge around it. Kept shallow on a light
 * canvas: deeper and the cells go muddy, paler and they wash into the
 * background. This is the ladder the theme probe picks between.
 */
const TINTS = [6, 0, -6, 4, -2]
const TINTS_DARK = [10, 14, 6, 16, 12]
/** How faint a cell goes right behind a line of text. */
const FAINT = 0.13
/** How many cells it takes to come back up to full strength. */
const FADE = 2.2
/** Clearing kept around each line of text, in px. */
const PAD = 5
const FADE_IN = 160
const FADE_OUT = 750

type Cell = {
  col: number
  row: number
  /** The wash, and the rim that makes it read as glowing. Both are fixed
   *  when the cell lights, so a fade-out keeps the colour it arrived with. */
  fill: string
  edge: string
  /** How much of its colour the cell is allowed, 0 to 1. */
  dim: number
  born: number
  /** When it starts to fade out. */
  until: number
}

const easeOut = (t: number) => 1 - (1 - t) ** 2
const easeIn = (t: number) => t * t

/**
 * A fine grid that takes colour where the pointer passes and lets it go a
 * moment later, with a few cells lighting on their own. Colour opens out
 * around the pointer across the whole spectrum — amber through mint, cyan,
 * blue, violet, magenta and rose — and the wheel turns as the pointer
 * travels, so a sweep leaves a rainbow ribbon rather than one flat wash.
 *
 * The layer is meant to sit once, at page level, under all the content: its
 * box is the full height of the document, so the hairlines tile from the
 * first band to the last and the field stays continuous while the reader
 * scrolls. See the JSX at the bottom for how the two halves of that layer
 * are sized.
 *
 * It is decoration only: hidden from assistive tech, transparent to the
 * pointer, drawn on one canvas that sleeps whenever nothing is lit, paused
 * off screen, and still for readers who ask for reduced motion.
 */
export function GridPulse({
  cell = 24,
  reach = 2.6,
  ambient = 2,
  maxLit = 180,
  avoid = '[data-grid-avoid]',
  className,
  style,
  ...props
}: GridPulseProps) {
  const box = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const el = box.current
    const paper = canvas.current
    const ctx = paper?.getContext('2d')
    if (!el || !paper || !ctx) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let cols = 1
    let rows = 1
    /** The box: as tall as the document, so the hairlines run to the end. */
    let width = 0
    let height = 0
    /** The canvas: as tall as the viewport. See the JSX at the bottom. */
    let canvasW = 0
    let canvasH = 0
    /** Cells that fit up one screen, used to aim the ambient beats. */
    let screenRows = 1
    let clear: DOMRect[] = []
    let tints = TINTS
    /** Where the spectrum currently sits, 0 to 1. Walks with the pointer. */
    let spin = 0
    const cells = new Map<string, Cell>()

    // Light or dark ground, read from the text colour the grid inherits,
    // so it follows any theme switch: a class, an attribute or the system.
    // Resolved through a pixel, since computed colours may be oklch.
    const probe = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    })
    const readTheme = () => {
      if (!probe) return
      probe.clearRect(0, 0, 1, 1)
      probe.fillStyle = getComputedStyle(el).color
      probe.fillRect(0, 0, 1, 1)
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
      const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5
      tints = light ? TINTS_DARK : TINTS
    }

    // Protect the lines of text, not the boxes that hold them: a paragraph
    // set to a measure keeps that width on its short last line too, and the
    // box would hold a band of cells dark where there is nothing to read.
    const measureText = () => {
      const bounds = el.getBoundingClientRect()
      const scope = el.parentElement ?? document
      clear = [...scope.querySelectorAll(avoid)].flatMap((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        const lines = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
        const boxes = lines.length > 0 ? lines : [node.getBoundingClientRect()]
        return boxes.map(
          (r) =>
            new DOMRect(
              r.left - bounds.left - PAD,
              r.top - bounds.top - PAD,
              r.width + PAD * 2,
              r.height + PAD * 2,
            ),
        )
      })
    }

    const measure = () => {
      width = el.clientWidth
      height = el.clientHeight
      cols = Math.max(1, Math.ceil(width / cell))
      rows = Math.max(1, Math.ceil(height / cell))
      // The hairlines tile the whole document, but the canvas is held to the
      // viewport: a document-tall backing store runs to hundreds of megabytes
      // at 2x and needs a full-area clear every frame. draw() shifts each row
      // by the box's scrolled position, so a lit cell still rides its own
      // hairline while the page moves under it.
      canvasW = paper.clientWidth
      canvasH = paper.clientHeight
      screenRows = Math.max(1, Math.ceil(canvasH / cell))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      paper.width = Math.round(canvasW * dpr)
      paper.height = Math.round(canvasH * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      readTheme()
      measureText()
      wake()
    }

    /**
     * How bright a cell may be, by its distance from the nearest line of
     * text. Cells behind the words go faint rather than dark: a hole cut in
     * the grid reads as a fault, a dip in brightness reads as depth.
     */
    const brightness = (col: number, row: number) => {
      const x = col * cell + cell / 2
      const y = row * cell + cell / 2
      let nearest = Number.POSITIVE_INFINITY
      for (const r of clear) {
        const dx = Math.max(r.left - x, 0, x - r.right)
        const dy = Math.max(r.top - y, 0, y - r.bottom)
        nearest = Math.min(nearest, Math.hypot(dx, dy))
        if (nearest === 0) break
      }
      if (nearest === Number.POSITIVE_INFINITY) return 1
      return FAINT + (1 - FAINT) * Math.min(1, nearest / (FADE * cell))
    }

    /** The pointer's cell, in document coordinates. Null until it moves. */
    let at: { col: number; row: number } | null = null

    /**
     * A cell's place on the spectrum, 0 to 1.
     *
     * Measured against the pointer and the band on screen, never against the
     * document: the layer is as tall as the whole page, so an absolute ramp
     * would keep a sliver of colour in view. Around the pointer the wheel
     * opens by direction — a cell north-east takes a different hue from one
     * south-west, distance only tipping it — so one stamp holds the whole
     * spectrum and still reads as a coherent rosette rather than confetti.
     */
    const tone = (col: number, row: number) => {
      if (at) {
        const dx = col - at.col
        const dy = row - at.row
        const away = Math.hypot(dx, dy) / reach
        // Only cells the pointer could have reached open as a rosette. Past
        // that distance a cell can only have lit on its own, and a lone cell
        // has no direction to be measured by, so it takes the screen's ramp.
        if (away <= 1.2) {
          return spin + Math.atan2(dy, dx) / (Math.PI * 2) + away * 0.22
        }
      }
      const down = (row - firstRow()) / Math.max(1, screenRows)
      return spin + down * 0.62 + (col / Math.max(1, cols)) * 0.14
    }

    /** The two colours a cell is drawn with, once, when it lights. */
    const palette = (col: number, row: number) => {
      const base = blend(tone(col, row))
      const lift = tints[Math.floor(Math.random() * tints.length)]
      const l = Math.min(74, Math.max(30, base.l + lift))
      const h = Math.round(base.h)
      return {
        fill: `hsl(${h} ${Math.round(base.s)}% ${l}%)`,
        edge: `hsl(${h} ${Math.round(base.s)}% ${Math.min(82, l + RIM_LIFT)}%)`,
      }
    }

    // One loop draws every cell; it runs only while something is lit.
    let frame = 0
    const draw = (now: number) => {
      frame = 0
      ctx.clearRect(0, 0, canvasW, canvasH)
      // Read per frame, not per measure: the canvas is pinned to the
      // viewport while the cells belong to the document, so the whole field
      // has to shift by however far the page has scrolled. A lit cell then
      // stays on its own hairline instead of drifting off it.
      const scrolled = el.getBoundingClientRect().top
      for (const [key, c] of cells) {
        let alpha: number
        if (now < c.until) {
          alpha = easeOut(Math.min(1, (now - c.born) / FADE_IN))
        } else {
          const t = (now - c.until) / FADE_OUT
          if (t >= 1) {
            cells.delete(key)
            continue
          }
          alpha = 1 - easeIn(t)
        }
        ctx.fillStyle = c.fill
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 1
        const x = c.col * cell + 1
        const y = c.row * cell + 1 + scrolled
        // Inset by the hairline, so the grid still shows between lit cells.
        ctx.globalAlpha = alpha * c.dim * PEAK
        ctx.fillRect(x, y, cell - 1, cell - 1)
        // A brighter rim one pixel inside the wash: at these opacities the
        // fill alone reads as a square, the edge is what makes it read as
        // glowing. Cheaper than a shadow, which would cost a blur per cell.
        ctx.globalAlpha = alpha * c.dim * RIM
        ctx.strokeRect(x + 1.5, y + 1.5, cell - 4, cell - 4)
      }
      ctx.globalAlpha = 1
      if (cells.size > 0) frame = requestAnimationFrame(draw)
    }
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    /** Lights one cell, unless it is off the grid or already lit. */
    const light = (col: number, row: number, hold: number) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return
      if (cells.size >= maxLit) return
      const key = `${col},${row}`
      const now = performance.now()
      const lit = cells.get(key)
      if (lit && now < lit.until) return
      // A cell caught again while fading picks up from where it had got to,
      // instead of blinking out and back in.
      let born = now
      if (lit) {
        const faded = 1 - easeIn(Math.min(1, (now - lit.until) / FADE_OUT))
        born = now - (1 - Math.sqrt(1 - faded)) * FADE_IN
      }
      const taken = lit ?? palette(col, row)
      cells.set(key, {
        col,
        row,
        // A cell caught again while fading keeps the colour it arrived with.
        fill: taken.fill,
        edge: taken.edge,
        dim: brightness(col, row),
        born,
        until: now + hold,
      })
      wake()
    }

    // The pointer paints. Cells further from it catch light less often, so
    // the edge of the trail breaks up instead of moving as a block.
    let pending = 0
    const paint = () => {
      pending = 0
      if (!at) return
      const cx = at.col
      const cy = at.row
      const span = Math.ceil(reach)
      for (let dy = -span; dy <= span; dy++) {
        for (let dx = -span; dx <= span; dx++) {
          const away = Math.hypot(dx, dy)
          if (away > reach) continue
          if (Math.random() > 1 - away / (reach + 0.6)) continue
          light(cx + dx, cy + dy, 260 + Math.random() * 900)
        }
      }
    }
    // Listened for on the window, because the grid sits under the content
    // and never receives the pointer itself.
    const onMove = (event: PointerEvent) => {
      const bounds = el.getBoundingClientRect()
      const next = {
        col: Math.floor((event.clientX - bounds.left) / cell),
        row: Math.floor((event.clientY - bounds.top) / cell),
      }
      if (at) {
        // The wheel turns with distance travelled rather than with time: a
        // pointer held still keeps the colours it lit, and a long drag
        // walks its trail through the spectrum instead of sliding one fixed
        // arrangement along the page.
        const moved = Math.hypot(next.col - at.col, next.row - at.row)
        spin = (spin + moved * TURN_PER_CELL) % 1
      }
      at = next
      if (!pending) pending = requestAnimationFrame(paint)
    }

    // A few cells find their own way on, so the grid is alive on arrival and
    // on a screen with no pointer at all. Paused while out of sight.
    let visible = true
    let beat = 0
    // On a field taller than the screen, a row drawn from the whole document
    // would land out of sight almost every time and the grid would read as
    // dead even while it was working. So the beat picks within the band the
    // reader is actually looking at.
    const firstRow = () => {
      const top = Math.floor(-el.getBoundingClientRect().top / cell)
      return Math.min(Math.max(top, 0), Math.max(0, rows - screenRows))
    }
    const drift = () => {
      beat = window.setTimeout(drift, 1400 + Math.random() * 1800)
      if (!visible || document.hidden) return
      for (let i = 0; i < ambient; i++) {
        light(
          Math.floor(Math.random() * cols),
          Math.min(rows - 1, firstRow() + Math.floor(Math.random() * screenRows)),
          900 + Math.random() * 1600,
        )
      }
    }
    beat = window.setTimeout(drift, 500)

    const sight = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
    })
    sight.observe(el)
    const resize = new ResizeObserver(measure)
    resize.observe(el)
    // Text added, removed or rewritten moves the lines to hold back from.
    let recheck = 0
    const copy = new MutationObserver(() => {
      if (!recheck) {
        recheck = requestAnimationFrame(() => {
          recheck = 0
          measureText()
        })
      }
    })
    copy.observe(el.parentElement ?? document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    const theme = new MutationObserver(readTheme)
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    scheme.addEventListener('change', readTheme)
    measure()
    // Lines of text move once the web fonts arrive.
    document.fonts?.ready.then(measureText).catch(() => {})
    window.addEventListener('pointermove', onMove, { passive: true })
    // The box is as tall as the document, so a change to the viewport alone
    // — a window turned, a mobile bar appearing — never resizes it and the
    // observer above stays quiet. The canvas has to hear about it from the
    // window or it keeps the old backing store.
    window.addEventListener('resize', measure)

    return () => {
      sight.disconnect()
      resize.disconnect()
      copy.disconnect()
      cancelAnimationFrame(recheck)
      theme.disconnect()
      scheme.removeEventListener('change', readTheme)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(pending)
      clearTimeout(beat)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', measure)
    }
  }, [cell, reach, ambient, maxLit, avoid])

  return (
    <div
      ref={box}
      aria-hidden
      data-slot="grid-pulse"
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        // The hairlines, faint on their own so the lit cells keep full ink.
        // Override with --grid-pulse-line.
        '[--grid-pulse-line:color-mix(in_oklab,var(--color-foreground)_7%,transparent)]',
        className,
      )}
      style={
        {
          '--grid-pulse-cell': `${cell}px`,
          backgroundImage:
            'linear-gradient(to right, var(--grid-pulse-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-pulse-line) 1px, transparent 1px)',
          backgroundSize: 'var(--grid-pulse-cell) var(--grid-pulse-cell)',
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      {/* Two halves, two jobs. The box above is in the document's flow and
          tiles the hairlines over the full page height, so the grid scrolls
          with the reading and never cuts out at a section edge. The canvas
          is pinned to the viewport and holds only the lit cells: at 2x a
          document-tall backing store costs hundreds of megabytes and a
          whole-page clear per frame, and none of the cells outside the
          screen can be seen anyway. draw() reconciles them by offsetting
          every row by the box's scrolled position.

          This relies on no ancestor of the layer having a transform, filter
          or contain — any of those would make it the canvas's containing
          block and confine it to a section again. The previous bottom fade
          mask went for the same reason: it grouped the fixed canvas and
          erased the last of every band. */}
      <canvas ref={canvas} className="fixed inset-0 size-full" />
    </div>
  )
}
