import { User, Phone, FileText, BookUser, Mail, Car, FileBadge, CarFront, IdCard, FacebookIcon, Send, Calendar, Smartphone, Radio } from 'lucide-vue-next';
import { SEARCH_FIELDS } from '../../shared/constants/searchItems.js';
const fieldIcons = { fio: User, date_of_birth: Calendar, number: Phone, mail: Mail, passport: IdCard, inn: FileText, snils: FileBadge, telegram: Send, vk: BookUser, facebook: FacebookIcon, imei: Smartphone, imsi: Radio, grz: Car, vin: CarFront };
export const SEARCH_FIELD_OPTIONS = SEARCH_FIELDS.map((field) => ({ ...field, icon: fieldIcons[field.type] }));
export const iconsSerchs = SEARCH_FIELD_OPTIONS;
