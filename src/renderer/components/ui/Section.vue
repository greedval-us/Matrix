<script setup>
defineProps({
  title: String,
  text: String,
  italic: Boolean
})
</script>

<template>
  <section class="space-y-2">
    <div class="transition-transform duration-200 ease-out inline-block group-hover:scale-[1.015]">
      <h2 class="text-xl font-semibold text-green-600">{{ title }}</h2>
      <p
        class="text-neutral-300"
        :class="{ italic: italic }"
        v-html="text"
      />
    </div>
  </section>
</template>
