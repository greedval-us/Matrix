export class ResultParser {
  constructor() {
    this.handlers = {
      object_data_base: this.parseObjectDataBase,
      object_data: this.parseObjectData,
      object_grouped: this.parseObjectGrouped,
      object_add_search: this.parseObjectAddSearch
    }
  }

  parse(item) {

    for (const key of Object.keys(this.handlers)) {
      if (item[key]) {
        return this.handlers[key].call(this, item[key])
      }
    }

    return { type: 'unknown', label: 'Неизвестно' }
  }

  // =====================
  // Handlers
  // =====================
  parseObjectDataBase(obj) {
    return {
      type: 'object_data_base',
      source: obj.name_table,
      name: obj.name,
      type_sources: obj.type,
      info: obj.info
    }
  }

  parseObjectData(obj) {
    return {
      type: 'object_data',
      source: obj.source_name,
      fields: Object.entries(obj.fields)
    }
  }

  parseObjectGrouped(obj) {
    return {
      type: 'object_grouped',
      label: 'Группировка',
      key: obj.key,
      items: obj.item
    }
  }

  parseObjectAddSearch(obj) {
    return {
      type: 'object_add_search',
      label: 'Рекомендованный поиск',
      fields: obj.item
    }
  }
}
