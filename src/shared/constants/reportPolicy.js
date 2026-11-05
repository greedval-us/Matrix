import { SEARCH_FIELD_IDS } from './searchItems.js';

export const REPORT_EXCLUDED_FIELD_IDS = Object.freeze(['fio', 'date_of_birth']);
export const REPORT_IDENTIFIER_FIELD_IDS = Object.freeze(
  SEARCH_FIELD_IDS.filter((field) => !REPORT_EXCLUDED_FIELD_IDS.includes(field)),
);
export const DEFAULT_REPORT_LIMITS = Object.freeze({ maxQueries: 100, maxRecords: 10000 });

// Only explicit identifier fields can extend the search. Free text is never scanned for numbers.
export const REPORT_IDENTIFIER_ALIASES = Object.freeze({
  number: Object.freeze(['number', 'phone', 'phone_number', 'mobile_phone', 'home_phone',
    'phone_client', 'phone_contragent', 'phone_mob', 'phone_dop', 'phone_work', 'number_work',
    'number_house', 'phone_house', 'work_number', 'home_number']),
  mail: Object.freeze(['mail', 'email', 'e_mail', 'email_address']),
  passport: Object.freeze(['passport', 'passport_number', 'passport_numb', 'passport_no', 'pasport', 'pasport_numb']),
  inn: Object.freeze(['inn']),
  snils: Object.freeze(['snils']),
  telegram: Object.freeze(['telegram', 'telegram_id']),
  vk: Object.freeze(['vk', 'vk_id']),
  facebook: Object.freeze(['facebook', 'facebook_id']),
  imei: Object.freeze(['imei']),
  imsi: Object.freeze(['imsi']),
  grz: Object.freeze(['grz', 'actual_grz', 'old_grz']),
  vin: Object.freeze(['vin']),
});
