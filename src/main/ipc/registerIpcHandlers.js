export function registerIpcHandlers(ipc, requests, events = {}, wrap = (_channel, handler) => handler) {
  const registeredRequests = [];
  const registeredEvents = [];
  const unregister = () => {
    for (const channel of registeredRequests.splice(0)) ipc.removeHandler(channel);
    for (const [channel, handler] of registeredEvents.splice(0)) ipc.removeListener(channel, handler);
  };
  try {
    for (const [channel, handler] of Object.entries(requests)) {
      ipc.handle(channel, wrap(channel, handler));
      registeredRequests.push(channel);
    }
    for (const [channel, handler] of Object.entries(events)) {
      ipc.on(channel, handler);
      registeredEvents.push([channel, handler]);
    }
  } catch (error) {
    unregister();
    throw error;
  }
  return unregister;
}
