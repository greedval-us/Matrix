import { defineStore } from "pinia"
import { reactive, computed } from "vue"
import { useGrpcStore } from "../grpcStore"

export const useDatabaseStore = defineStore("database", () => {
  const grpcStore = useGrpcStore()

  const state = reactive({
    rows: [],
    selectedType: "Все",
    sortKey: null,
    sortDirection: "asc",
    loading: false,
    error: null,
  })

  const types = computed(() => {
    const set = new Set(state.rows.map(r => r.type ?? "Неизвестно"))
    return ["Все", ...Array.from(set).sort()]
  })

  const filteredRows = computed(() => {
    let result =
      state.selectedType === "Все"
        ? [...state.rows]
        : state.rows.filter(
            r => (r.type ?? "Неизвестно") === state.selectedType
          )

    if (state.sortKey) {
      result.sort((a, b) => {
        const valA = a[state.sortKey] ?? ""
        const valB = b[state.sortKey] ?? ""

        if (state.sortKey === "count") {
          return state.sortDirection === "asc"
            ? (parseInt(valA) || 0) - (parseInt(valB) || 0)
            : (parseInt(valB) || 0) - (parseInt(valA) || 0)
        }

        return state.sortDirection === "asc"
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA))
      })
    }
    return result
  })

  const filteredCountSum = computed(() =>
    filteredRows.value.reduce(
      (sum, row) => sum + (parseInt(row.count) || 0),
      0
    )
  )

  const filteredRowCount = computed(() => filteredRows.value.length)

  async function fetchAll(email = "john.doe@example.com") {
    state.loading = true
    state.error = null
    try {
      const payload = { request: email }
      const result = await grpcStore.databaseAll(payload)
      state.rows = result
    } catch (e) {
      state.error = e.message ?? e.toString()
    } finally {
      state.loading = false
    }
  }

  function setSort(key) {
    if (state.sortKey === key) {
      state.sortDirection =
        state.sortDirection === "asc" ? "desc" : "asc"
    } else {
      state.sortKey = key
      state.sortDirection = "asc"
    }
  }

  function setFilter(type) {
    state.selectedType = type
  }

  function reset() {
    state.rows = []
    state.selectedType = "Все"
    state.sortKey = null
    state.sortDirection = "asc"
    state.error = null
  }

  return {
    state,
    types,
    filteredRows,
    filteredCountSum,
    filteredRowCount,
    fetchAll,
    setSort,
    setFilter,
    reset,
  }
})
