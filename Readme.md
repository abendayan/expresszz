# Utils for microservices
Collection of stuff to help quickly build a express server with redis session

### Usage
```
const { Expresszz } = require('expresszz')
async function run() {
    const service = new Expresszz('name', 5555, process.env.REDIS_URL, process.env.REDIS_SECRET)
    await service.configureApp()
    service.configRoute('get', '/url', [() => service.logger.info('test')])
    service.run()
}
run ()
```