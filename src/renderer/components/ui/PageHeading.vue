<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
});
</script>

<template>
  <header class="mx-page-heading flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <span v-if="eyebrow" class="mx-eyebrow mb-2 block">{{ eyebrow }}</span>
      <h1>{{ title }}</h1>
      <p v-if="description" class="max-w-2xl text-sm">{{ description }}</p>
    </div>
    <slot />
  </header>
</template>
