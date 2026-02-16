import * as XLSX from 'xlsx'

function groupBySource(data) {
    const sources = {}

    // Группируем по source (не по key)
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

function sanitizeSheetName(name) {
    return name.replace(/[/\\?*[\]:]/g, '_').substring(0, 31)
}

export default class ExcelExportService {
    export(data) {
        const wb = XLSX.utils.book_new()
        const grouped = groupBySource(data)
        const sheetNamesSet = new Set()

        grouped.forEach((group) => {
            // Преобразуем record.fields ([[key, value], ...]) в объект
            const rows = group.records.map(record => {
                const row = {}
                if (Array.isArray(record.fields)) {
                    record.fields.forEach(([field, value]) => {
                        row[field] = value
                    })
                }
                return row
            })

            let sheetName = sanitizeSheetName(group.name || 'Sheet')

            // Проверка уникальности имени листа
            let uniqueName = sheetName
            let suffix = 1
            while (sheetNamesSet.has(uniqueName)) {
                uniqueName = sheetName.substring(0, 31 - suffix.toString().length - 1) + '_' + suffix
                suffix++
            }
            sheetNamesSet.add(uniqueName)

            const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Нет данных': '' }])
            XLSX.utils.book_append_sheet(wb, ws, uniqueName)
        })

        XLSX.writeFile(wb, 'результат.xlsx')
    }
}
