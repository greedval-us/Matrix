import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
pdfMake.vfs = pdfFonts.default

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

    data.forEach(item => {
        if (item.type === 'object_data' && sources[item.source]) {
            sources[item.source].records.push(item)
        }
    })

    return Object.values(sources)
}

export default class PdfExportService {
    export(data) {
        const grouped = groupBySource(data)
        const content = []

        grouped.forEach((group, index) => {
            // Заголовок источника
            content.push(
                { text: `Источник: ${group.name}`, style: 'header' },
                { text: group.info || '', style: 'subheader', margin: [0, 0, 0, 10] }
            )

            if (group.records.length) {
                group.records.forEach((record) => {
                    if (!Array.isArray(record.fields)) return

                    // Формируем строки с key: value
                    const lines = record.fields.map(([key, value]) => ({
                        text: `${key}: ${value ?? ''}`,
                        margin: [0, 0, 0, 2]
                    }))

                    content.push({
                        stack: lines,
                        margin: [0, 0, 0, 10],
                        style: 'recordBlock'
                    })
                })
            } else {
                content.push({
                    text: 'Нет данных',
                    italics: true,
                    margin: [0, 0, 0, 15]
                })
            }

            if (index < grouped.length - 1) {
                content.push({ text: '', margin: [0, 0, 0, 10] })
            }
        })

        const docDefinition = {
            content,
            defaultStyle: { font: 'Roboto' },
            styles: {
                header: { fontSize: 16, bold: true, margin: [0, 0, 0, 6] },
                subheader: { fontSize: 10, color: 'gray' },
                recordBlock: { margin: [0, 0, 0, 10], fontSize: 10 }
            }
        }

        pdfMake.createPdf(docDefinition).download('результат.pdf')
    }
}
