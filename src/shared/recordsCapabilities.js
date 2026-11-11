import { RECORDS_UNAVAILABLE_MESSAGE } from './constants/records.js';

// Both sides of IPC enforce the same capability contract; truthy values cannot
// enable an operation and an unavailable repository cannot grant any capability.
export function normalizeRecordsCapabilities(value) {
  const available = value?.available === true;
  return {
    available,
    list: available && value.list === true,
    upload: available && value.upload === true,
    download: available && value.download === true,
    remove: available && value.remove === true,
    create: available && value.create === true,
    update: available && value.update === true,
    delete: available && value.delete === true,
    message: typeof value?.message === 'string' ? value.message : (available ? '' : RECORDS_UNAVAILABLE_MESSAGE),
  };
}
