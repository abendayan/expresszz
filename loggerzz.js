const winston = require('winston')
const expressWinston = require('express-winston')

class LoggerZZ {
  constructor(name) {
    this.name = name
    this.logConfiguration = {
      level: 'info',
      format: winston.format.combine(winston.format.json(), winston.format.colorize()),
      defaultMeta: { service: this.name },
      transports: [
        new winston.transports.Console()
      ],
    }
    this.logger = winston.createLogger(this.logConfiguration)
  }

  addToExpress(app) {
    app.use(expressWinston.logger(this.logConfiguration))
  }
}

module.exports = LoggerZZ