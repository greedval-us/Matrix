<script setup>
import { APP_DISPLAY_NAME } from '../../../shared/constants/appDisplayName.js';

defineProps({ collapsed: Boolean });
</script>

<template>
  <div class="h-16 flex items-center px-6 text-2xl pl-24 font-semibold tracking-wide text-white">
    <span v-show="!collapsed" class="text-green-600">{{ APP_DISPLAY_NAME }}</span>
  </div>
</template>
