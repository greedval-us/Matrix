import log from 'electron-log';

log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s} [{level}] {text}';
log.transports.console.format = '{y}-{m}-{d} {h}:{i}:{s} [{level}] {text}';

log.transports.file.resolvePathFn = () => 'logs/log_proces.log';

export default log;