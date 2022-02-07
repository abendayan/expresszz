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
  get: jest.fn().mockImplementation((key, _cb) => _cb('err')),
  on: jest.fn(),
  del: jest.fn(),
  set: jest.fn()
}))

jest.spyOn(network, 'get_public_ip').mockImplementation(() => {
  return '127.0.0.1'
})

const { Expresszz } = require('../service')

describe('Simple service', () => {
  let service
  beforeEach(async () => {
    service = new Expresszz('test-service', 5151,  'redis://redis:6379', 'secret', { apiPrefix: '/test' })
    await service.configureApp()
    service.configRoute('get', 'echo', [(req, res) => {
      return res.status(200).send('this is a test')
    }])
    service.configRoute('post', 'post', [(req, res) => {
      return res.status(200).send('this is a post test')
    }])
    service.configRoute('put', 'put', [(req, res) => {
      return res.status(200).send('this is a put test')
    }])
    await service.run()
  })

  afterEach(async () => {
    await service.stop()
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

  test('On defined route',  (done) => {
    request(service.app)
      .get('/test/echo')
      .expect(201)
      .end((err, res) => {
        expect(res.text).toEqual('this is a test')
        done()
      })
  })

  test('On post',  (done) => {
    request(service.app)
      .post('/test/post')
      .expect(201)
      .end((err, res) => {
        expect(res.text).toEqual('this is a post test')
        done()
      })
  })

  test('On put',  (done) => {
    request(service.app)
      .put('/test/put')
      .expect(201)
      .end((err, res) => {
        expect(res.text).toEqual('this is a put test')
        done()
      })
  })
})