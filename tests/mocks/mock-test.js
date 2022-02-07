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