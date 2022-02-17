const request = require('supertest')
require('./mocks/mock-test')

const { ExpressZZ } = require('../main')

describe('Proxy test', () => {
  let service
  let app
  beforeEach(async () => {
    service = new ExpressZZ('test-service', 5152,  'redis://redis:6379', 'secret', { apiPrefix: '/test' })
    await service.configureApp()
    service.configRoute('get', 'echo', [(logger, req, res) => {
      return res.status(200).send('this is a test')
    }])
    await service.run()
    app = new ExpressZZ('test-app', 5150,  'redis://redis:6379', 'secret', { apiPrefix: '/second' })
    await app.configureApp()
    app.configRoute('get', 'hello', [(logger, req, res) => {
      return res.status(200).send('this is a test')
    }])
    await app.run()
  })

  afterEach(async () => {
    await service.stop()
    await app.stop()
  })

  test('Proxy',  async () => {
    jest.spyOn(app, 'getServiceMap').mockImplementation(() => [{ prefix: service.apiPrefix, port: service.defaultPort, host: '127.0.0.1' }])
    await app.buildProxies()
    const res = await request(service.app)
      .get('/test/echo')
      .expect(200)
    expect(res.text).toEqual('this is a test')
  })
})