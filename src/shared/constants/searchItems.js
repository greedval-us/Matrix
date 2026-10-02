import {
  User, Phone, FileText, BookUser, Mail, Car, FileBadge,
  CarFront, IdCard, FacebookIcon, Send, Calendar, Smartphone, Radio
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
  { type: 'imei', label: 'IMEI', icon: Smartphone },
  { type: 'imsi', label: 'IMSI', icon: Radio },
  { type: 'grz', label: 'ГРЗ', icon: Car },
  { type: 'vin', label: 'VIN', icon: CarFront },
]

export const defaultPatterns = {
  fio: '^[A-Za-zА-Яа-яЁё-]+(?:\\s+[A-Za-zА-Яа-яЁё-]+)*$',
  date_of_birth: '^(0?[1-9]|[12][0-9]|3[01])\\.(0?[1-9]|1[0-2])\\.(19\\d{2}|20[0-3]\\d|2040)$',
  number: '^\\d{8,15}$',
  mail: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  passport: '^\\d{10}$',
  inn: '^(?:\\d{9}|\\d{10}|\\d{12})$',
  snils: '^\\d{11}$',
  telegram: '^\\d{5,20}$',
  vk: '^\\d{5,20}$',
  facebook: '^[a-zA-Z0-9.]{5,50}$',
  imei: '^\\d{15}$',
  imsi: '^\\d{14,15}$',
  grz: '^(?:[ABEKMHOPCTYXАВЕКМНОРСТУХ]\\d{3}[ABEKMHOPCTYXАВЕКМНОРСТУХ]{2}|\\d{4}[ABEKMHOPCTYXАВЕКМНОРСТУХ]{2})$',
  vin: '^[A-HJ-NPR-Z0-9]{17}$'
}

export const defaultPlaceholders = {
  fio: 'Иванов Иван Иванович',
  date_of_birth: '31.12.1990',
  number: '8-15 цифр без +, пробелов и скобок',
  mail: 'name@example.com',
  passport: '1234567890 (10 цифр)',
  inn: '1234567890 (9, 10 или 12 цифр)',
  snils: '12345678901 (11 цифр)',
  telegram: '123456789',
  vk: '123456789',
  facebook: '123456789',
  imei: '123456789012345 (15 цифр)',
  imsi: '250011234567890 (14-15 цифр)',
  grz: 'A123BC или 1234AB',
  vin: 'XTA210990Y2765432 (17 символов)',
}
