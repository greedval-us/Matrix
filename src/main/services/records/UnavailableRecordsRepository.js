import { RECORDS_UNAVAILABLE_MESSAGE, UNAVAILABLE_RECORDS_CAPABILITIES } from '../../../shared/constants/records.js';

export { RECORDS_UNAVAILABLE_MESSAGE };

// Replace this adapter after the server contract has been agreed. No search RPC
// or local store can stand in for a remote row with a stable attachment identity.
export class UnavailableRecordsRepository {
  getCapabilities() {
    return { ...UNAVAILABLE_RECORDS_CAPABILITIES };
  }

  list() { throw new Error(RECORDS_UNAVAILABLE_MESSAGE); }
  uploadFiles() { throw new Error(RECORDS_UNAVAILABLE_MESSAGE); }
  downloadFile() { throw new Error(RECORDS_UNAVAILABLE_MESSAGE); }
  removeFile() { throw new Error(RECORDS_UNAVAILABLE_MESSAGE); }
}
