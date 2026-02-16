import { defineStore } from 'pinia'
import { ref } from 'vue'
import { FileService } from '../../services/FileService'
import { GrpcService } from "../../services/GrpcService"
import { ResultParser } from '../../utils/ResultParser'
import ManagerExport from '../../services/export/MenegerExport'


export const usePackagesSearchStoreUI = defineStore('packagesSearchUI', () => {
  const grpcService = new GrpcService(window.grpcAPI)
  const parser = new ResultParser()
  const exportManager = new ManagerExport()

  const queryText = ref('')
  const searchField = ref('number')
  const formats = ref({
    txt: true,
    pdf: false,
    csv: false,
    excel: false
  })

  const fields = [
  { value: "number", label: "Телефон" },
  { value: "mail", label: "E-mail" },
  { value: "snils", label: "СНИЛС" },
  { value: "inn", label: "ИНН" },
  { value: "passport", label: "Паспорт" },
  { value: "fio", label: "ФИО" },
  { value: "date_of_birth", label: "Дата рождения" },
  { value: "telegram", label: "Telegram" },
  { value: "vk", label: "ВКонтакте" },
  { value: "facebook", label: "Facebook" },
  { value: "grz", label: "Госномер (ГРЗ)" },
  { value: "vin", label: "VIN" },
]

  const logs = ref([])

  const fileService = new FileService(window.fileDialog, window.fileAPI)

  function addLog(msg) {
    logs.value.push(msg)
  }

  function setQuery(val) {
    queryText.value = val
  }

  function toggleFormat(key) {
    if (formats.value[key] !== undefined) {
      formats.value[key] = !formats.value[key]
    }
  }

  async function openFile() {
    try {
      addLog('⏳ Ожидание выбора TXT-файла...')
      const result = await fileService.openFile()
      if (!result) {
        addLog('⚠️ Файл не выбран')
        return
      }
      const { filePath, data } = result
      setQuery(data)
      addLog(`📂 TXT-файл успешно загружен: ${filePath}`)
    } catch (err) {
      console.error(err)
      addLog(`❌ Ошибка загрузки TXT-файла: ${err.message}`)
    }
  }

  async function saveFiles() {
    try {
      const selectedFormats = Object.keys(formats.value).filter(f => formats.value[f])
      if (selectedFormats.length === 0) {
        addLog('⚠️ Не выбран ни один формат для сохранения')
        return
      }

      for (const format of selectedFormats) {
        const ext = format === 'excel' ? 'xlsx' : format
        const filePath = await fileService.saveFile(`query.${ext}`, [
          { name: format.toUpperCase(), extensions: [ext] }
        ])
        if (!filePath) {
          addLog(`⚠️ Сохранение ${format.toUpperCase()} отменено`)
          continue
        }

        let dataToSave = queryText.value
        if (format === 'excel') {
          dataToSave = queryText.value
        }

        await fileService.writeFile(dataToSave, filePath)
        addLog(`✅ Файл сохранён: ${filePath}`)
      }
    } catch (err) {
      console.error(err)
      addLog(`❌ Ошибка при сохранении файлов: ${err.message}`)
    }
  }


  async function runSearch() {
    
  const lines = queryText.value.split(/\r?\n/).filter(line => line.trim() !== '')
  if (lines.length === 0) {
    addLog('⚠️ Нет данных для поиска')
    return
  }

  // --- спрашиваем папку для сохранения файлов ---
  const saveFolder = await fileService.openFolder()
  if (!saveFolder) {
    addLog('⚠️ Папка для сохранения не выбрана')
    return
  }
  addLog(`📂 Файлы будут сохраняться в папку: ${saveFolder}`)

  const tabId = 'mainSearchTab'

  try {
    addLog('🚀 Создание gRPC клиента...')
    await grpcService.createClient(tabId)
    addLog('✅ Клиент создан')

    for (const [index, line] of lines.entries()) {
      addLog(`🔍 Поиск строки ${index + 1}/${lines.length}: "${line}"`)

      // --- формируем payload со всеми ключами ---
      const payload = {}
      fields.forEach(f => {
        payload[f.value] = null
      })
      payload[searchField.value] = line

      try {
        const results = await grpcService.baseSearch(tabId, payload)
        addLog(`✅ Результаты получены для строки ${index + 1}`)
        console.log(results)

        const selectedFormats = Object.keys(formats.value).filter(f => formats.value[f])
        for (const format of selectedFormats) {
          const ext = format === 'excel' ? 'xlsx' : format
          const fileName = line || 'результат'
          const filePath = `${saveFolder}/${fileName}.${ext}`
        
          const normalized = Array.isArray(results)
            ? results.map(item => parser.parse(item))
            : []
        
          let dataToSave
        
          switch (format) {
            case 'txt':
              dataToSave = exportManager.export(normalized, 'txtFs')
              break
        
            case 'csv':
              dataToSave = exportManager.export(normalized, 'csvFs')
              break
        
            case 'pdf':
              dataToSave = await exportManager.export(normalized, 'pdfFs')
              break
        
            case 'excel':
              dataToSave = exportManager.export(normalized, 'excelFs')
              break
          }
      
          await fileService.writeFile(dataToSave, filePath)
          addLog(`💾 Файл сохранён: ${filePath}`)
        }
      } catch (err) {
        addLog(`❌ Ошибка поиска для строки ${index + 1}: ${err.message}`)
      }
    }
  } catch (err) {
    addLog(`❌ Ошибка при создании клиента: ${err.message}`)
  } finally {
    try {
      addLog('🗑️ Уничтожение gRPC клиента...')
      await grpcService.destroyClient(tabId)
      addLog('✅ Клиент уничтожен')
      addLog('✅ Поиск завершон')
    } catch (err) {
      addLog(`❌ Ошибка при уничтожении клиента: ${err.message}`)
    }
  }
}



  function resetState() {
    queryText.value = ''
    searchField.value = 'number'
    formats.value = {
      txt: true,
      pdf: false,
      csv: false,
      excel: false
    }
    logs.value = []
    if (fileService) fileService.clear()
  }


  return {
    queryText,
    searchField,
    formats,
    logs,
    setQuery,
    addLog,
    toggleFormat,
    openFile,
    saveFiles,
    runSearch,
    resetState
  }
})
