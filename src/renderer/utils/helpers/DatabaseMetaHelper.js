export function processAndGroupMeta(data) {
  const processed = data
    .map(item => {
      const [datePart] = item.created_at.split(' ')
      const [dayStr, monthStr, yearStr] = datePart.split('.')
      const day = parseInt(dayStr, 10)
      const month = parseInt(monthStr, 10)
      const year = parseInt(yearStr, 10)

      return {
        ...item,
        year,
        month,
        day,
        formattedDate: `${dayStr}-${monthStr}-${yearStr}`
      }
    })
    .filter(item => item.year >= 2025)

  if (!processed.length) return {}

  const updatesByMonth = {}
  processed.forEach(item => {
    const key = `${item.year}-${item.month}`
    if (!updatesByMonth[key]) updatesByMonth[key] = { year: item.year, month: item.month, items: [] }
    updatesByMonth[key].items.push(item)
  })

  const sortedKeys = Object.keys(updatesByMonth).sort((a, b) => {
    const [yearA, monthA] = a.split('-').map(Number)
    const [yearB, monthB] = b.split('-').map(Number)
    return yearA === yearB ? monthB - monthA : yearB - yearA
  })

  const monthNames = [
    'Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
  ]

  const sortedUpdates = {}
  sortedKeys.forEach(k => {
    const { year, month, items } = updatesByMonth[k]
    const monthName = monthNames[month - 1]
    if (!sortedUpdates[year]) sortedUpdates[year] = {}
    sortedUpdates[year][monthName] = items
  })

  return sortedUpdates
}
