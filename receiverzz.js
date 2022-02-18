const amqp = require('amqplib')
const LoggerZZ = require('./loggerzz')

class ReceiverZZ {
  constructor(amqpUrl, queue, handleMessage) {
    this.amqpUrl = amqpUrl
    this.queue = queue
    const loggerZZ = new LoggerZZ(`receiver-${queue}`)
    this.logger = loggerZZ.logger
    this.handleMessage = handleMessage
  }

  receive = async () => {
    try {
      const connection = await amqp.connect(this.amqpUrl)
      const channel = await connection.createChannel()
      await channel.assertQueue(this.queue, { durable: true })
      await channel.prefetch(1)
      this.logger.info(`Waiting for message in queue ${this.queue}`)
      const self = this
      const responses = function(params) {
        return function(cllb) {
          channel.consume(self.queue, function (msg) {
            const secs = msg.content.toString().split('.').length - 1
            self.logger.info(`received message ${msg.content.toString()}`)
            cllb(msg.content, params)
            setTimeout(function() {
              self.logger.info('Done [*]')
              channel.ack(msg)
            }, secs * 1000)
          }, {
            noAck: false
          })
        }
      }
      return { responses }
    } catch (error) {
      this.logger.error(`Couldn't send message ${error}`)
    }
  }

  run = async () => {
    this.logger.info('Start listening')
    const { responses } = await this.receive()
    const handle = responses()
    const self = this
    handle((rspAMQP) => {
      self.handleMessage(self.logger, rspAMQP, ...arguments)
    })
  }
}

module.exports = ReceiverZZ
