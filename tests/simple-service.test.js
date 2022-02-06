const request = require('supertest')
const redis = require('redis')
const network = require('network')

jest.mock('winston', () => ({
  format: {
    colorize: jest.fn(),
    combine: jest.fn(),
    json: jest.fn()
  },
  createLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn()
  }),
  transports: {
    Console: jest.fn()
  }
}))

jest.spyOn(redis, 'createClient').mockImplementation(() => ({
  connect: jest.fn(),
  on: jest.fn(),
  set: jest.fn()
}))

jest.spyOn(network, 'get_public_ip').mockImplementation(() => {
  return '127.0.0.1'
})

const { Expresszz } = require('../service')

describe('Simple service', () => {
  let service
  beforeAll(async () => {
    service = new Expresszz('test-service', 5151,  'redis://redis:6379', 'secret', { apiPrefix: '/test' })
    await service.configureApp()
    service.configRoute('get', 'echo', [() => 'test'])
    await service.run()
  })

  test('Not found',  (done) => {
    request(service.app)
      .get('/api/echo')
      .expect(404)
      .end((err, res) => {
        expect(res.body).toEqual({})
        done()
      })
  })
})