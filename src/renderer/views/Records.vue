<script setup>
import PageHeading from '../components/ui/PageHeading.vue';
import { finishDialogLeave } from '../components/ui/AppDialog.vue';
import RecordsToolbar from '../components/records/RecordsToolbar.vue';
import RecordsTable from '../components/records/RecordsTable.vue';
import RecordsPagination from '../components/records/RecordsPagination.vue';
import RemoveAttachmentDialog from '../components/records/RemoveAttachmentDialog.vue';
import RecordEditorDialog from '../components/records/RecordEditorDialog.vue';
import DeleteRecordDialog from '../components/records/DeleteRecordDialog.vue';
import { useRecordsTable } from '../composables/useRecordsTable.js';

const records = useRecordsTable();
const { state, available, busy } = records;
</script>

<template>
  <div class="mx-page records-page mx-auto flex w-full max-w-[1600px] flex-col">
    <PageHeading title="Контроль" />
    <p v-if="state.error" role="alert" class="mx-alert mb-3">{{ state.error }}</p>
    <p v-if="state.notice" role="status" class="mx-alert mx-success mb-3">{{ state.notice }}</p>
    <section class="mx-panel records-panel" aria-label="Таблица записей">
      <div class="records-toolbar-container">
        <RecordsToolbar :query="state.query" :loading="busy" :available="available" :can-create="state.capabilities.create === true"
          :columns="state.columns" :sort="state.sort"
          @query="records.setQuery" @sort="records.setSort" @refresh="records.refresh" @create="records.requestCreate" />
      </div>
      <RecordsTable :columns="state.columns" :rows="state.rows" :loading="busy" :available="available"
        :error="state.error" :query="state.query" :sort="state.sort" :capabilities="state.capabilities"
        :page="state.page" :page-size="state.pageSize"
        :pending-rows="state.pendingRows" :pending-files="state.pendingFiles"
        @sort="records.setSort" @upload="records.upload" @download="records.download" @remove="records.requestRemove" @edit="records.requestEdit" @delete="records.requestDelete" />
      <div class="records-pagination-container">
        <RecordsPagination :page="state.page" :page-size="state.pageSize" :total="state.total" :loading="busy || !available"
          @page="records.setPage" @page-size="records.setPageSize" />
      </div>
    </section>
    <Transition name="dialog" @after-leave="finishDialogLeave">
      <RecordEditorDialog v-if="state.editor" :editor="state.editor" :busy="state.editorBusy" :error="state.editorError"
        @change="records.setEditorValue" @save="records.saveRecord" @close="records.closeEditor" />
    </Transition>
    <Transition name="dialog" @after-leave="finishDialogLeave">
      <DeleteRecordDialog v-if="state.rowDeleteTarget" :row="state.rowDeleteTarget" :busy="state.rowDeleteBusy" :error="state.rowDeleteError"
        @confirm="records.confirmDelete" @close="records.closeDelete" />
    </Transition>
    <Transition name="dialog" @after-leave="finishDialogLeave">
      <RemoveAttachmentDialog v-if="state.deleteTarget" :file="state.deleteTarget.file" :busy="state.deleteBusy"
        :error="state.deleteError" @confirm="records.confirmRemove" @close="records.closeRemove" />
    </Transition>
  </div>
</template>

<style scoped>
.records-page { height: 100%; min-height: 320px; padding: 18px clamp(12px, 2vw, 28px); }
.records-page :deep(.mx-page-heading) { margin-bottom: 14px; flex: none; }
.records-panel { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
.records-toolbar-container { flex: none; padding: 10px 12px; border-bottom: 1px solid var(--mx-border); }
.records-pagination-container { flex: none; padding: 8px 12px; border-top: 1px solid var(--mx-border); }
</style>
