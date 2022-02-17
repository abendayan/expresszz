const amqp = require('amqplib')
const LoggerZZ = require('./logger')

class ProducerZZ {
  constructor(amqpUrl) {
    this.amqpUrl = amqpUrl
    const loggerZZ = new LoggerZZ(`queue-${queue}`)
    this.logger = loggerZZ.logger
  }

  sendMessageToQueue = async (queue, data) => {
    try {
      const connection = await amqp.connect(this.amqpUrl)
      const channel = await connection.createChannel()
      await channel.assertQueue(queue, { durable: true })
      await channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), { persistent: true })
      const self = this
      setTimeout(function () {
        channel.connection.close()
        self.logger.info('closing channel')
      }, 500)
    }
    catch (error) {
      this.logger.error(`Couldn't send message ${error}`)
    }
  }
}

module.exports = ProducerZZ
