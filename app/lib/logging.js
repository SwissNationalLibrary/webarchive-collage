const conf = require('../conf/index');
const pino = require('pino');

// add more transports here if needed
const transport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    crlf: false,
    levelFirst: true,
    ignore: 'hostname',
  },
});

module.exports = (prefix = 'EHELV-ACCESS-COLLAGE') => {
  return pino(
    {
      name: prefix,
      level: 'trace',
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport
  );
};
