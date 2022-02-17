const amqp = require('amqplib')
const LoggerZZ = require('./loggerzz')

class ProducerZZ {
  constructor(amqpUrl, queue) {
    this.amqpUrl = amqpUrl
    this.queue = queue
    const loggerZZ = new LoggerZZ(`queue-${queue}`)
    this.logger = loggerZZ.logger
  }

  sendMessageToQueue = async (data) => {
    try {
      const connection = await amqp.connect(this.amqpUrl)
      const channel = await connection.createChannel()
      await channel.assertQueue(this.queue, { durable: true })
      await channel.sendToQueue(this.queue, Buffer.from(JSON.stringify(data)), { persistent: true })
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
