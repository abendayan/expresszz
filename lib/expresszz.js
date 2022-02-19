const express  = require('express')
const redis = require('redis')
const session = require('express-session')
const RedisStore = require('connect-redis')(session)
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const { createProxyMiddleware } = require('http-proxy-middleware')
const network = require('network')
const rateLimit = require('express-rate-limit')
const LoggerZZ = require('./loggerzz')
const http = require('http')
const https = require('https')
const fs = require('fs')

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

class ExpressZZ {
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
    const { apiPrefix, httpsPort, privateKey, certificate } = params
    this.privateKey = privateKey ? fs.readFileSync(privateKey, 'utf8') : null
    this.certificate = certificate ? fs.readFileSync(certificate, 'utf8') : null
    this.httpsPort = httpsPort
    this.apiPrefix = apiPrefix
    this.redis_secret = secret
    this.middlewareSession = this.middlewareSession.bind(this)
    this.redis_url = redisUrl
    this.service_name = name
    this.defaultPort = port
    this.loggerZZ = new LoggerZZ(`${this.service_name}-service`)
    this.logger = this.loggerZZ.logger
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

  dataSaved () {
    return (
      {
        prefix: this.apiPrefix,
        port: this.defaultPort,
        httpsPort: this.httpsPort,
        credential: { key: this.privateKey, cert: this.certificate },
        host: this.host,
        name: this.service_name
      }
    )
  }

  async subscribeService() {
    const client = this.getConnection('service')
    await client.connect()
    const data = this.dataSaved()
    const logger = this.logger
    client.set(`service-${this.service_name}`, JSON.stringify(data), (err) => {
      if (err) {
        logger.error('Service not properly subscribed', { err })
        throw err
      }
    })
  }

  async unsuscribeService() {
    const client = this.getConnection('service')
    await client.connect()
    const data = this.dataSaved()
    const logger = this.logger
    client.del(`service-${this.service_name}`, JSON.stringify(data), (err) => {
      if (err) {
        logger.error('Service not properly unsubscribed', { err })
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
    this.app.disable('X-Powered-By')
    const options = await this.buildSessionOptions()
    this.app.use(session(options))
    this.app.use(cookieParser())
    this.loggerZZ.addToExpress(this.app)
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
    services.forEach(({ prefix, port, host, httpsPort, credential }) => {
      if (port) {
        this.app.use(createProxyMiddleware(prefix, { target: `${host}:${port}`, changeOrigin: true }))
      }
      if (httpsPort) {
        this.app.use(createProxyMiddleware(prefix, { target: `${host}:${httpsPort}`, protocol: 'https:', ssl: credential, changeOrigin: true }))
      }
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

  addLoggerToCallback(callback) {
    const self = this
    return function () {
      callback(self.logger, ...arguments)
    }
  }

  buildCallbackWithSession(callbacks, withSession) {
    return withSession ? [this.middlewareSession, ...callbacks] : callbacks
  }

  buildCallbacksWithApiLimiter(callbacks, withLimiter) {
    return withLimiter ? [apiLimiter, ...callbacks] : callbacks
  }

  configRoute(type, url, callbacks, params = {}) {
    const { session, limitApi } = params
    const urlWithPrefix = `${this.apiPrefix}/${url}`
    const callbacksWithLoggers = callbacks.map(callback => this.addLoggerToCallback(callback))
    const defineCallbacks = this.buildCallbacksWithApiLimiter((this.buildCallbackWithSession(callbacksWithLoggers, session)), limitApi)
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
      case 'ws':
        this.app.ws(url, defineCallbacks[0])
        break
    }
  }

  async run() {
    const self = this
    if (this.defaultPort) {
      this.httpServer = http.createServer(this.app)
      this.serverHttp = this.httpServer.listen(self.defaultPort, () => {
        this.logger.info(`Up and running on port ${self.defaultPort} ! This is our ${this.service_name} service`)
      })
    }
    if (this.certificate && this.privateKey) {
      this.httpsServer = https.createServer({ key: this.privateKey, cert: this.certificate }, this.app)
      this.serverHttps = this.httpsServer.listen(self.httpsPort, () => {
        this.logger.info(`Up and running on port ${self.httpsPort} with https ! This is our ${this.service_name} service`)
      })
    }
  }

  async stop() {
    if (this.serverHttp) {
      this.serverHttp.close(async () => {
        await this.unsuscribeService()
      })
    }
    if (this.serverHttps) {
      this.serverHttps.close(async () => {
        await this.unsuscribeService()
      })
    }
  }
}

module.exports = ExpressZZ