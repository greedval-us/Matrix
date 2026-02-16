import {
  User, Phone, FileText, BookUser, Mail, Car, FileBadge,
  CarFront, IdCard, FacebookIcon, Send, Calendar
} from 'lucide-vue-next'

export const iconsSerchs = [
  { type: 'fio', label: 'ФИО', icon: User },
  { type: 'date_of_birth', label: 'Дата рождения', icon: Calendar },
  { type: 'number', label: 'Телефон', icon: Phone },
  { type: 'mail', label: 'Email', icon: Mail },
  { type: 'passport', label: 'Паспорт', icon: IdCard },
  { type: 'inn', label: 'ИНН', icon: FileText },
  { type: 'snils', label: 'СНИЛС', icon: FileBadge },
  { type: 'telegram', label: 'Telegram ID', icon: Send },
  { type: 'vk', label: 'VK ID', icon: BookUser },
  { type: 'facebook', label: 'Facebook ID', icon: FacebookIcon },
  { type: 'grz', label: 'ГРЗ', icon: Car },
  { type: 'vin', label: 'VIN', icon: CarFront },
]

export const defaultPatterns = {
  fio: '^[А-Яа-яЁё\\-\\s]{0,100}$', // ФИО — русские буквы, пробел и дефис, до 100 символов
  date_of_birth: '^(0?[1-9]|[12][0-9]|3[01])\\.(0?[1-9]|1[0-2])\\.(19\\d{2}|20[0-3]\\d|2040)$', // День.месяц.год
  number: '^\\+?\\d{8,15}$', // Телефон с возможным +, 8-15 цифр
  mail: '^[^ @]+@[^ @]+\\.[^ @]+$', // Email
  passport: '^\\d{0,10}$', // Паспорт — только цифры, до 10
  inn: '^\\d{10}|\\d{12}$', // ИНН — 10 или 12 цифр
  snils: '^\\d{11}$', // СНИЛС — 11 цифр
  telegram: '^[a-zA-Z0-9_]{5,32}$', // Telegram ID — латиница, цифры и _, 5-32 символа
  vk: '^[0-9]{5,}$', // VK ID — только цифры, минимум 5
  facebook: '^[a-zA-Z0-9.]{5,50}$', // Facebook ID — латиница, цифры, точка, 5-50 символов
  grz: '^([АВЕКМНОРСТУХ]\\d{3}[АВЕКМНОРСТУХ]{2}|\\d{4}[АВЕКМНОРСТУХ]{2})$', // ГРЗ — русские буквы + цифры, до 9
  vin: '^[A-HJ-NPR-Z0-9]{0,17}$' // VIN — буквы (без I,O,Q) + цифры, до 17
}

export const defaultPlaceholders = {
  date_of_birth: 'ДД.ММ.ГГГГ',
  passport: '10 цифр паспорта',
  inn: 'ИНН (до 12 цифр)',
  snils: 'СНИЛС (до 11 цифр)',
  vin: 'VIN (17 символов)',
  mail: 'example@example.com',
  grz: 'М000ММ или 0000ММ',
}