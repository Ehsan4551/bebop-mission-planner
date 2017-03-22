
# To compile and start the client in production mode

To install the dependencies do:

```
npm install
```

Build the application:

```
npm run build:prod
```

To start the application do:

```
npm start
```

# Debugging

```
npm run build:dev 
npm run server:dev 
```

Chrome can use sourcmap files in order to debug directly in typescipt source files. The generation of sourcemap is controlled via the devtool option in the 
webpack configuration. To debug with Chrome, open the browser, load the website (localhost:port) and hit F12. In the sources tab you find a branch called 
'webpack://' which lists .ts source files. You can set breakpoints directly in these typescript files.

# Stuff which needs to be installed globally

Everything required should be installed via 'npm install' and used from local node_modules via devDependencies in package.json.

# Upgrade dependencies

$> npm update
Use the 'ncu' tool to check for outdated dependencies
If it's not, you need to install it first 
$> npm install -g npm-check-updates
Then use as:
$> ncu
or 
$> ncu -u

Then use
$> npm update 

# Deprecated: Typings Notes

To be able to update / add typings with the 'typings' command you need to install it first:

$> npm install --global typings

Then you can install additional typings like this:
('--save' means the typings package is added to your typings.json)

$> typings install (--global) --save express // saves to typings.json

If typings are not available in npm repository but e.g. in 'dt', then use for example

$> typings install socket.io-client --save --global --source dt

# Debugging with VS Code

You can use this plugin if you want to debug in visual studio code. Works also with typescript source maps.
Chrome debugger can't be used at the same time.

https://marketplace.visualstudio.com/items?itemName=msjsdiag.debugger-for-chrome

You need a launch.json configuration similar to:

{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch Chrome against localhost, with sourcemaps",
            "type": "chrome",
            "request": "launch",
            "url": "http://localhost:3000",
            "sourceMaps": true,
            "webRoot": "${workspaceRoot}"
        },
        {
            "name": "Attach to Chrome, with sourcemaps",
            "type": "chrome",
            "request": "attach",
            "port": 9222,
            "sourceMaps": true,
            "webRoot": "${workspaceRoot}"
        }
    ]
}

# If things are messed up

Do a 'npm cache clear', and there are global npm modules installed here:
C:\Users\jruesch\AppData\Roaming\npm\node_modules
Clean this up.

# License checker

To compile the list of licenses you need to install license-checker:
$> npm install -g license-checker

# Issues with Errorhandler typings

Replace thisin errorhandler index.d.ts:
  function errorHandler(options?: errorHandler.Options): express.ErrorRequestHandler;
with this
function errorHandler(options?: errorHandler.Options): express.ErrorHandler;
  
  