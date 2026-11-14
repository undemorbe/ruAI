<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DayPoint } from '../api'
import { rub } from '../format'

/** Выручка и расход API по дням (для длинных периодов — по 3 или 7 дней). */
const props = defineProps<{ points: DayPoint[] }>()
const hover = ref<number | null>(null)

const dm = (d: string) => d.slice(5).split('-').reverse().join('.')
const bins = computed(() => {
  const size = props.points.length > 120 ? 7 : props.points.length > 45 ? 3 : 1
  const out: (DayPoint & { label: string })[] = []
  for (let i = 0; i < props.points.length; i += size) {
    const part = props.points.slice(i, i + size)
    const first = dm(part[0]!.date)
    out.push({
      date: part[0]!.date,
      label: size > 1 ? `${first}–${dm(part.at(-1)!.date)}` : first,
      revenueRub: part.reduce((n, p) => n + p.revenueRub, 0),
      apiRub: part.reduce((n, p) => n + p.apiRub, 0),
    })
  }
  return out
})
const max = computed(() => Math.max(1, ...bins.value.map((b) => Math.max(b.revenueRub, b.apiRub))))
const W = 720
const H = 180
const step = computed(() => W / Math.max(1, bins.value.length))
const y = (v: number) => H - (v / max.value) * (H - 8)
const tip = computed(() => (hover.value === null ? null : bins.value[hover.value]))
</script>

<template>
  <figure class="dc">
    <div class="dc__legend">
      <span><i class="k k--rev"></i>Выручка</span>
      <span><i class="k k--api"></i>Расход OpenRouter</span>
      <span class="dc__tip">{{ tip ? `${tip.label}: ${rub(tip.revenueRub)} · ${rub(tip.apiRub)}` : `макс. ${rub(max)}` }}</span>
    </div>
    <svg :viewBox="`0 0 ${W} ${H + 18}`" preserveAspectRatio="none" role="img" aria-label="Выручка и расход API по дням" @mouseleave="hover = null">
      <line x1="0" :x2="W" :y1="H" :y2="H" class="dc__axis" />
      <g v-for="(b, i) in bins" :key="b.date" @mouseenter="hover = i" @touchstart.passive="hover = i">
        <rect :x="i * step" y="0" :width="step" :height="H" class="dc__hit" :class="{ on: hover === i }" />
        <rect :x="i * step + step * 0.12" :y="y(b.revenueRub)" :width="step * 0.42" :height="H - y(b.revenueRub)" class="dc__rev" />
        <rect :x="i * step + step * 0.58" :y="y(b.apiRub)" :width="step * 0.3" :height="H - y(b.apiRub)" class="dc__api" />
      </g>
    </svg>
    <div class="dc__ends">
      <span>{{ bins[0]?.label }}</span>
      <span>{{ bins.at(-1)?.label }}</span>
    </div>
  </figure>
</template>

<style scoped>
.dc {
  margin: 0;
}
.dc__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-bottom: 8px;
  color: var(--text-2);
  font-size: 12.5px;
}
.k {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 2px;
  vertical-align: -1px;
}
.k--rev {
  background: var(--ink);
}
.dc__rev {
  fill: var(--ink);
}
.k--api {
  background: var(--accent);
}
.dc__api {
  fill: var(--accent);
}
.dc__tip {
  margin-left: auto;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
svg {
  display: block;
  width: 100%;
  height: 190px;
}
.dc__hit {
  fill: transparent;
}
.dc__hit.on {
  fill: var(--bg-sunken);
}
.dc__axis {
  stroke: var(--line-strong);
  vector-effect: non-scaling-stroke;
}
.dc__ends {
  display: flex;
  justify-content: space-between;
  margin-top: -14px;
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
</style>
