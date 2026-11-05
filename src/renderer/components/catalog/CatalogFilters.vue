<script setup>
import { formatResultCount } from '../../constants/resultPresentation.js';
defineProps({ types: { type: Array, required: true }, selectedType: { type: String, required: true }, rowCount: { type: Number, required: true }, recordCount: { type: Number, required: true } });
const emit = defineEmits(['filter']);
</script>

<template>
  <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
    <label class="space-y-2 text-sm"
      ><span class="block text-matrix-muted">Тип источника</span
      ><select
        :value="selectedType"
        class="mx-input min-w-[180px]"
        @change="emit('filter', $event.target.value)"
      >
        <option v-for="type in types" :key="type">{{ type }}</option>
      </select></label
    >
    <div class="flex gap-4 text-sm text-matrix-muted">
      <p>
        <strong class="mr-1 text-matrix-text">{{ rowCount }}</strong
        >источников
      </p>
      <p>
        <strong class="mr-1 text-matrix-text">{{
          formatResultCount(recordCount)
        }}</strong
        >записей
      </p>
    </div>
  </div>
</template>
