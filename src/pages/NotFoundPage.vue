<template>
  <main class="nf">
    <b>404</b>
    <h1>Такой страницы нет</h1>
    <RouterLink to="/" class="btn btn--ink">На главную</RouterLink>
  </main>
</template>

<style scoped>
.nf {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  min-height: 100dvh;
  padding: 16px;
  text-align: center;
}
b {
  font: 800 clamp(80px, 18vw, 160px) / 1 var(--font-display);
  letter-spacing: -0.06em;
  color: var(--accent);
}
h1 {
  margin: 0 0 12px;
  font: 600 22px var(--font-display);
}
</style>
