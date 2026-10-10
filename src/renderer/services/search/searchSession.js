// Normal search owns one client; batch search owns one client around multiple queries.
export async function withSearchClient(service, id, run, { onCleanupError } = {}) {
  let requestError;
  try {
    await service.createClient(id);
    return await run();
  } catch (error) {
    requestError = error;
    throw error;
  } finally {
    try {
      await service.destroyClient(id);
    } catch (error) {
      if (onCleanupError) onCleanupError(error);
      else if (!requestError) throw error;
    }
  }
}
