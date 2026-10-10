<script setup>
import { Paperclip } from 'lucide-vue-next';
import PageHeading from '../components/ui/PageHeading.vue';
import { finishDialogLeave } from '../components/ui/AppDialog.vue';
import RecordsToolbar from '../components/records/RecordsToolbar.vue';
import RecordsTable from '../components/records/RecordsTable.vue';
import RecordsPagination from '../components/records/RecordsPagination.vue';
import RemoveAttachmentDialog from '../components/records/RemoveAttachmentDialog.vue';
import { useRecordsTable } from '../composables/useRecordsTable.js';

const records = useRecordsTable();
const { state, available, busy } = records;
</script>

<template>
  <div class="mx-page records-page mx-auto flex min-h-full w-full max-w-[1600px] flex-col">
    <PageHeading title="Записи" description="Данные из базы и прикреплённые к ним файлы.">
      <span class="mx-badge"><Paperclip aria-hidden="true" class="h-3.5 w-3.5" />Файлы в каждой строке</span>
    </PageHeading>
    <p v-if="state.error" role="alert" class="mx-alert mb-4">{{ state.error }}</p>
    <p v-if="state.notice" role="status" class="mx-alert mx-success mb-4">{{ state.notice }}</p>
    <section class="mx-panel min-w-0 overflow-hidden" aria-label="Таблица записей">
      <div class="records-toolbar-container">
        <RecordsToolbar :query="state.query" :loading="busy" :available="available"
          @query="records.setQuery" @refresh="records.refresh" />
      </div>
      <RecordsTable :columns="state.columns" :rows="state.rows" :loading="busy" :available="available"
        :error="state.error" :query="state.query" :sort="state.sort" :capabilities="state.capabilities"
        :pending-rows="state.pendingRows" :pending-files="state.pendingFiles"
        @sort="records.setSort" @upload="records.upload" @download="records.download" @remove="records.requestRemove" />
      <div class="records-pagination-container">
        <RecordsPagination :page="state.page" :page-size="state.pageSize" :total="state.total" :loading="busy || !available"
          @page="records.setPage" @page-size="records.setPageSize" />
      </div>
    </section>
    <Transition name="dialog" @after-leave="finishDialogLeave">
      <RemoveAttachmentDialog v-if="state.deleteTarget" :file="state.deleteTarget.file" :busy="state.deleteBusy"
        :error="state.deleteError" @confirm="records.confirmRemove" @close="records.closeRemove" />
    </Transition>
  </div>
</template>

<style scoped>
.records-page { min-width: 0; }
.records-toolbar-container { padding: 18px; border-bottom: 1px solid var(--mx-border); }
.records-pagination-container { padding: 0 18px 16px; border-top: 1px solid var(--mx-border); }
</style>
