function requireApi(name) {
  const api = globalThis.window?.[name];
  if (!api) throw new Error(`Desktop API ${name} is unavailable`);
  return api;
}

export const getSearchApi = () => requireApi('searchAPI');
export const getStoreApi = () => requireApi('storeAPI');
export const getFileApi = () => requireApi('fileAPI');
export const getFileDialogApi = () => requireApi('fileDialog');
export const getRecordsApi = () => requireApi('recordsAPI');
