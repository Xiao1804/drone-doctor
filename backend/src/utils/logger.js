const packageInfo = require('../../package.json');

function write(level, event, context = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    version: process.env.APP_VERSION || packageInfo.version,
    ...context,
  };

  const output = JSON.stringify(payload);
  if (level === 'ERROR') {
    process.stderr.write(`${output}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }
}

module.exports = {
  debug(event, context) {
    if (process.env.NODE_ENV !== 'production') write('DEBUG', event, context);
  },
  info(event, context) {
    write('INFO', event, context);
  },
  warn(event, context) {
    write('WARN', event, context);
  },
  error(event, context) {
    write('ERROR', event, context);
  },
};
