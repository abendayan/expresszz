# ExpressZZ
Utils to help to quickly build an express server

### Usage
Examples are in the examples folder

```js
const {Expresszz} = require('lib/expresszz')

async function run() {
    const service = new Expresszz('name', 5555, process.env.REDIS_URL, process.env.REDIS_SECRET)
    await service.configureApp()
    service.configRoute('get', '/url', [() => service.logger.info('test')])
    service.run()
}

run()
```