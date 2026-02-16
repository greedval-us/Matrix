function groupBySource(data) {
  const sources = {}

  // Группируем базы
  data.forEach(item => {
    if (item.type === 'object_data_base') {
      sources[item.source] = {
        source: item.source,
        name: item.name,
        info: item.info,
        records: []
      }
    }
  })

  // Добавляем данные
  data.forEach(item => {
    if (item.type === 'object_data' && sources[item.source]) {
      // fields = [[key,value],...]
      sources[item.source].records.push(item.fields)
    }
  })

  return Object.values(sources)
}

function escapeCsv(value) {
  if (value === undefined || value === null) return ''
  const str = String(value)
  return (str.includes('"') || str.includes(',') || str.includes('\n'))
    ? `"${str.replace(/"/g, '""')}"`
    : str
}

export default class CsvExportServiceFS {
  /**
   * Генерирует CSV-строку для сохранения на диск
   * @param {Array} data – массив результатов поиска
   * @returns {string} – готовый CSV текст (с BOM для Excel)
   */
  export(data) {
    const grouped = groupBySource(data)
    let csv = ''

    grouped.forEach((group, index) => {
      csv += `Источник: ${escapeCsv(group.name)}\n`
      if (group.info) csv += `${escapeCsv(group.info)}\n`
      csv += '\n'

      if (group.records.length) {
        // собираем уникальные ключи
        const headersSet = new Set()
        group.records.forEach(fields => {
          fields.forEach(([key]) => headersSet.add(key))
        })
        const headers = Array.from(headersSet)

        csv += headers.map(escapeCsv).join(',') + '\n'

        group.records.forEach(fields => {
          const rowMap = Object.fromEntries(fields)
          const row = headers.map(key => escapeCsv(rowMap[key] ?? ''))
          csv += row.join(',') + '\n'
        })
      } else {
        csv += '"Нет данных"\n'
      }

      if (index < grouped.length - 1) csv += '\n'
    })

    // BOM нужен для корректного открытия в Excel
    return '\uFEFF' + csv
  }
}
