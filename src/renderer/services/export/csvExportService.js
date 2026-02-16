function groupBySource(data) {
    const sources = {}

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
            sources[item.source].records.push(item.fields) // fields = [[key, value], ...]
        }
    })

    return Object.values(sources)
}

function escapeCsv(value) {
    if (value === undefined || value === null) return ''
    const str = String(value)
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

export default class CsvExportService {
    export(data) {
        const grouped = groupBySource(data)
        let csv = ''

        grouped.forEach((group, index) => {
            csv += `"Источник: ${escapeCsv(group.name)}"\n`
            if (group.info) csv += `"${escapeCsv(group.info)}"\n`
            csv += '\n'

            if (group.records.length) {
                // Собираем все уникальные ключи из всех записей
                const headersSet = new Set()
                group.records.forEach(fields => {
                    fields.forEach(([key]) => headersSet.add(key))
                })
                const headers = Array.from(headersSet).map(escapeCsv)
                csv += headers.join(',') + '\n'

                // Заполняем строки
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

        const bom = '\uFEFF'
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'результат.csv'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }
}
