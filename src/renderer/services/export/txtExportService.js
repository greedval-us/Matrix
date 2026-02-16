function groupBySource(data) {
    const sources = {}

    // Группируем по source (а не key)
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

    // Добавляем записи object_data
    data.forEach(item => {
        if (item.type === 'object_data' && sources[item.source]) {
            sources[item.source].records.push(item)
        }
    })

    return Object.values(sources)
}

export default class TxtExportService {
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
                    txt += '\n'  // пустая строка между записями
                })
            } else {
                txt += 'Нет данных\n\n'
            }

            if (index < grouped.length - 1) {
                txt += '-----------------------\n\n'
            }
        })

        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'результат.txt'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }
}
