function groupBySource(data) {
  const sources = {}

  // группировка по source (как и в первой версии)
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

  // добавляем object_data
  data.forEach(item => {
    if (item.type === 'object_data' && sources[item.source]) {
      sources[item.source].records.push(item)
    }
  })

  return Object.values(sources)
}

/**
 * Вторая реализация: возвращает текст, не триггерит загрузку браузером
 */
export default class TxtExportServiceFS {
  /**
   * Генерирует текст для сохранения во внешний файл
   * @param {Array} data – массив результатов поиска
   * @returns {string} – готовый текст
   */
  export(data) {
    const grouped = groupBySource(data)
    let txt = ''

    grouped.forEach((group, index) => {
      txt += `Источник: ${group.name}\n`
      if (group.info) txt += `${group.info}\n`
      txt += '\n'

      if (group.records.length) {
        group.records.forEach(record => {
          if (!Array.isArray(record.fields)) return
          record.fields.forEach(([key, value]) => {
            txt += `${key} = ${value != null ? value : ''}\n`
          })
          txt += '\n'
        })
      } else {
        txt += 'Нет данных\n\n'
      }

      if (index < grouped.length - 1) {
        txt += '-----------------------\n\n'
      }
    })

    return txt
  }
}
