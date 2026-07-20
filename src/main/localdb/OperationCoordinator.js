export class OperationCoordinator {
  static activeOperations = new Map();

  async runExclusive(operationKey, callback) {
    if (OperationCoordinator.activeOperations.has(operationKey)) {
      throw new Error(`Operation "${operationKey}" is already running`);
    }

    const operationPromise = (async () => await callback())();
    OperationCoordinator.activeOperations.set(operationKey, operationPromise);

    try {
      return await operationPromise;
    } finally {
      if (OperationCoordinator.activeOperations.get(operationKey) === operationPromise) {
        OperationCoordinator.activeOperations.delete(operationKey);
      }
    }
  }
}
