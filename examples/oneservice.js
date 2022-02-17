const { Expresszz } = require('../service')

async function run() {
  const service = new Expresszz('test-service', 5151,  process.env.REDIS_URL, process.env.REDIS_SECRET, { apiPrefix: '/test' })
  await service.configureApp()
  service.configRoute('get', 'echo', [(logger, req, res) => {
    logger.info('Got the request')
    return res.status(200).send('this is a test')
  }])
  service.run()
}

run()