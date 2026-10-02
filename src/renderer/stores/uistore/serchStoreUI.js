import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { Field } from '../../utils/Field'
import { iconsSerchs, defaultPatterns, defaultPlaceholders } from '../../../shared/constants/searchItems'
import { key as translateKey } from '../../../shared/constants/translateKey'
import { help } from '../../../shared/constants/help'
import { useSearchStore } from '../searchStore'
import { useTabStore } from '../tabStore'
import { ResultParser } from '../../utils/ResultParser'
import { useHistoryStore } from '../historyStore'

export const useSearchUIStore = defineStore('searchUI', () => {
  // ========================
  // State
  // ========================
  const tabStore = useTabStore()
  const historyStore = useHistoryStore()
  const parser = new ResultParser()
  const icons = ref(iconsSerchs)

  // Активная база для каждой вкладки
  const activeBases = reactive({}) // { tabId: 'База 1' }

  // ========================
  // Helpers
  // ========================
  function getTab(tabId) {
    return tabStore.state.searchStates[tabId]
  }

  // ========================
  // Getters
  // ========================
  function getSelectedFields(tabId) {
    return getTab(tabId)?.selectedFields || {}
  }

  function getResults(tabId) {
    return getTab(tabId)?.results || []
  }

  function getLoading(tabId) {
    return getTab(tabId)?.loading || false
  }

  function getError(tabId) {
    return getTab(tabId)?.error || ''
  }

  function getMeta(tabId) {
    return getTab(tabId)?.meta || null
  }

  function getReceived(tabId) {
    return getTab(tabId)?.received || 0
  }

  function getFieldValue(tabId, type) {
    const field = getTab(tabId)?.selectedFields[type]
    return field ? field.value : ''
  }

  function getFieldLabel(type) {
    return translateKey[type] || type
  }

  function getPlaceholder(type) {
    return defaultPlaceholders[type] || ''
  }

  function getPattern(type) {
    return defaultPatterns[type] || '.*'
  }

  function getHelp(type) {
    return (help[type] || '') + (help['wildcards'] || '')
  }

  function getFullQuery(tabId) {
    const fields = getSelectedFields(tabId)
    const query = {}
    iconsSerchs.forEach(({ type }) => {
      query[type] = fields[type]?.value ?? ''
    })
    return query
  }

  // ========================
  // Actions / Setters
  // ========================
  function setFieldValue(tabId, type, value) {
    const tab = getTab(tabId)
    const field = tab?.selectedFields[type]
    if (!field) return
    field.setValue(value)
  }

  function toggleField(tabId, type) {
    const tab = getTab(tabId)
    if (!tab) return
    if (type in tab.selectedFields) {
      delete tab.selectedFields[type]
      delete tab.collapsedFields[type]
    } else {
      tab.selectedFields[type] = reactive(new Field(type, '', getPattern(type)))
      tab.selectedFields[type].placeholder = getPlaceholder(type)
      tab.collapsedFields[type] = false
    }
  }

  function toggleCollapse(tabId, type) {
    const tab = getTab(tabId)
    if (!tab) return
    tab.collapsedFields[type] = !tab.collapsedFields[type]
  }

  function appendResults(tabId, data) {
    if (!Array.isArray(data) || data.length === 0) return
    const normalized = data.map(item => parser.parse(item))
    const tab = getTab(tabId)
    if (tab) {
      tab.results.push(...normalized)
    }
  }

  function setLoading(tabId, value) {
    const tab = getTab(tabId)
    if (tab) tab.loading = value
  }

  function setError(tabId, value) {
    const tab = getTab(tabId)
    if (tab) tab.error = value || ''
  }

  function setMeta(tabId, value) {
    const tab = getTab(tabId)
    if (tab) tab.meta = value || null
  }

  function setReceived(tabId, value) {
    const tab = getTab(tabId)
    if (tab) tab.received = Number(value) || 0
  }

  function clearTab(tabId) {
    delete activeBases[tabId]
  }

async function search(tabId) {
  const searchStore = useSearchStore()
  const query = getFullQuery(tabId)

  const newTitle = Object.values(query).filter(v => v).join(', ')
  tabStore.updateTabTitleBySearch(tabId, newTitle)

  try {
    clearResults(tabId)
    setError(tabId, '')
    setMeta(tabId, null)
    setReceived(tabId, 0)
    setLoading(tabId, true)
    await searchStore.createClient(tabId)
    const response = await searchStore.search(tabId, query, {
      onChunk: (items, received) => {
        appendResults(tabId, items)
        setReceived(tabId, received)
      }
    })
    setMeta(tabId, response?.meta)

    const fields = getSelectedFields(tabId)
    iconsSerchs.forEach(({ type }) => {
      const value = fields[type]?.value
      if (value) historyStore.addHistoryItem(type, value)
    })
  } catch (e) {
    console.error('Search error:', e)
    setError(tabId, e?.message || String(e))
  } finally {
    setLoading(tabId, false)
    await searchStore.destroyClient(tabId)
  }
}

  function cancelSearch(tabId) {
    const searchStore = useSearchStore()
    searchStore.cancelSearch(tabId)
  }

  function quickSearch(tabId, fieldUpdates) {
    resetAllFields(tabId)
    for (const [key, value] of Object.entries(fieldUpdates)) {
      toggleField(tabId, value.key)
      setFieldValue(tabId, value.key, value.value)
    }
    search(tabId)
  }

  function clearResults(tabId) {
    const tab = getTab(tabId)
    if (tab) {
      tab.results = []
      tab.error = ''
      tab.meta = null
      tab.received = 0
    }
  }

  function resetAllFields(tabId) {
    const tab = getTab(tabId)
    if (tab) {
      tab.selectedFields = {}
      tab.collapsedFields = {}
    }
  }

  // ========================
  // Навигация по базам
  // ========================
  function setActiveBase(name, tabId = tabStore.state.activeTabId) {
    if (!tabId) return
    activeBases[tabId] = name
    // Прокрутка к выбранной базе
    const el = document.querySelector(`[data-base-name="${name}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function getActiveBase(tabId = tabStore.state.activeTabId) {
    return activeBases[tabId] || null
  }

  // ========================
  // Return
  // ========================
  return {
    icons,

    // Навигация
    activeBases,
    setActiveBase,
    getActiveBase,

    // Getters
    getSelectedFields,
    getResults,
    getLoading,
    getError,
    getMeta,
    getReceived,
    getFieldValue,
    getFieldLabel,
    getPlaceholder,
    getPattern,
    getHelp,
    getFullQuery,

    // Actions
    setFieldValue,
    toggleField,
    toggleCollapse,
    appendResults,
    setLoading,
    setError,
    setMeta,
    setReceived,
    clearTab,
    search,
    cancelSearch,
    quickSearch,
    clearResults,
    resetAllFields
  }
})
