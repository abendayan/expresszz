const express  = require('express')
const redis = require('redis')
const session = require('express-session')
const RedisStore = require('connect-redis')(session)
const winston = require('winston')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const expressWinston = require('express-winston')
const { createProxyMiddleware } = require('http-proxy-middleware')
const network = require('network')

class Expresszz {
  constructor(name, port, redisUrl, secret, params = {}) {
    if (!name) {
      throw new Error('The name of the service is required')
    }
    if (!port) {
      throw new Error('The port is required for the service to run')
    }
    if (!redisUrl) {
      throw new Error('The redis url is required')
    }
    if (!secret) {
      throw new Error('The redis secret is required')
    }
    const { apiPrefix } = params
    this.apiPrefix = apiPrefix
    this.redis_secret = secret
    this.middlewareSession = this.middlewareSession.bind(this)
    this.redis_url = redisUrl
    this.service_name = name
    this.defaultPort = port
    this.logConfiguration = {
      level: 'info',
      format: winston.format.combine(winston.format.json(), winston.format.colorize()),
      defaultMeta: { service: `${this.service_name}-service` },
      transports: [
        new winston.transports.Console()
      ],
    }
    this.logger = winston.createLogger(this.logConfiguration)
    this.app = express()
    this.connections = {}
    const self = this
    network.get_public_ip(function(err, ip) {
      if (err) {
        self.logger.error('Could not retrieve the ip', { err })
        throw err
      }
      self.logger.info('Ip found', { ip })
      self.host = ip
    })
  }

  async subscribeService() {
    const client = this.getConnection('service')
    await client.connect()
    const data = {
      prefix: this.apiPrefix,
      port: this.defaultPort,
      host: this.host
    }
    const logger = this.logger
    client.set(`service-${this.service_name}`, JSON.stringify(data), (err) => {
      if (err) {
        logger.error('Service not properly subscribed', { err })
        throw err
      }
    })
  }

  buildRedisClient() {
    const logger = this.logger
    const client = redis.createClient({
      url: this.redis_url,
      legacyMode: true
    })
    client.on('connect', function() {
      logger.info('Redis Connected!')
    })
    client.on('error', function(error) {
      logger.error('error', error)
    })
    return client
  }

  getConnection(connectionName) {
    if (!this.connections[connectionName]) {
      this.connections[connectionName] = this.buildRedisClient()
    }
    return this.connections[connectionName]
  }

  async buildSessionOptions() {
    const client = this.getConnection('session')
    await client.connect()
    return {
      secret: this.redis_secret,
      cookie: { secure: false, expires: true, maxAge: 24 * 60 * 60 * 1000 },
      store: new RedisStore({
        client: client,
        ttl: 26000
      }),
      saveUninitialized: false,
      resave: false
    }
  }

  async configureApp() {
    this.app.use(bodyParser.urlencoded({ extended: true }))
    this.app.use(bodyParser.json())
    this.app.disable('x-powered-by')
    const options = await this.buildSessionOptions()
    this.app.use(session(options))
    this.app.use(cookieParser())
    this.app.use(expressWinston.logger(this.logConfiguration))
    await this.subscribeService()
  }

  async getServiceMap() {
    const client = this.getConnection('service')
    const logger = this.logger
    let cursor = '0'
    const found = []
    do {
      const reply = await client.scan(cursor, 'MATCH', 'service-*')
      logger.info('Service found', { reply })
      cursor = reply[0]
      found.push(...reply[1])
    } while (cursor !== '0')
    return found
  }

  async buildProxies() {
    const services = await this.getServiceMap()
    services.forEach(({ prefix, port, host }) => {
      this.app.use(createProxyMiddleware(prefix, { target: `${host}:${port}`, changeOrigin: true }))
    })
  }

  middlewareSession (req, res, next) {
    const sessionCookie = cookieParser.signedCookie(req.cookies['connect.sid'], this.redis_secret)
    const key = `sess:${sessionCookie}`
    this.getConnection('session').get(key, function (err, data) {
      if (data) {
        return next()
      } else {
        req.session.destroy()
        res.status(401)
        return res
      }
    })
  }

  configRoute(type, url, callbacks, params = {}) {
    const { session } = params
    const urlWithPrefix = `${this.apiPrefix}/${url}`
    const defineCallbacks = session ? [this.middlewareSession, ...callbacks] : callbacks
    switch (type) {
    case 'post':
      this.app.post(urlWithPrefix, defineCallbacks)
      break
    case 'get':
      this.app.get(urlWithPrefix, defineCallbacks)
      break
    case 'put':
      this.app.put(urlWithPrefix, defineCallbacks)
      break
    }
  }

  async run() {
    const port = this.defaultPort
    this.app.listen(port, () => {
      this.logger.info(`Up and running on port ${port} ! This is our ${this.service_name} service`)
    })
  }
}

module.exports = {
  Expresszz
}