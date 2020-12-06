# sam-starter-ts
## Setup
```sh
// install dependencies
$ npm install
```

## Local Development
```sh
// invoke function
$ sam local invoke <FUNCTION_NAME> -e event.json
$ echo '{"message": "Hello"}' | sam local invoke --debug-port 6970 --event - <FUNCTION_NAME>
```
To setup stepping-through code in Nodejs code, configure the following:
```yml
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to SAM CLI",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      // From the sam init example, it would be "${workspaceRoot}/hello-world"
      "localRoot": "${workspaceRoot}/{directory of node app}",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
 }
```

## Deployment
```sh
// deploy dev
$ npm run deploy:dev

// deploy prod
$ npm run deploy:prod
```
