var http = require('http');
var url = require('url');
var fs = require('fs');
var sockjs = require('sockjs');

var rabbitUrl = 'amqp://localhost'; //default, might be overwritten below...

// discover the bound CloudFoundry RabbitMQ service if available
if (process.env.VCAP_SERVICES) {
  var services = JSON.parse(process.env.VCAP_SERVICES);
  for (serviceType in services) {
    if (serviceType.match(/rabbit*/)) {
      var service = services[serviceType][0];
      console.log("Connecting to RabbitMQ service " + service.name + ":" + service.credentials.url);
      rabbitUrl = service.credentials.url;
      break;
    }
  }
}

var context = require('rabbit.js').createContext(rabbitUrl);

var httpserver = http.createServer(handler);
var sockjs_opts = {sockjs_url: "http://sockjs.github.com/sockjs-client/sockjs-latest.min.js"};
var sjs = sockjs.createServer(sockjs_opts);
sjs.installHandlers(httpserver, {prefix: '[/]socks'});

context.on('ready', function() {
  sjs.on('connection', function(connection) {
    connection.on('data', function firstMessage(username) {
      if (authenticate(username)) {
        connection.removeListener('data', firstMessage);
        var usersock = context.socket('SUB');
        var exchange = 'pubsubdemo.users.' + username;
        usersock.connect(exchange, function() {
          console.log('bound queue to ' + exchange);
        });
        usersock.pipe(connection);
        connection.on('data', function(msg) {
          console.log('received from client: ' + msg);
        });
      }
      else {
        connection.write('Nice try!');
        connection.close();
      }
    });
  });
});

function authenticate(username) {
  return /^larry$|^curly$|^moe$/.test(username);
}

httpserver.listen(process.env.VCAP_APP_PORT || 9999);
console.log('listening')

function handler(req, res) {
  var path = url.parse(req.url).pathname;
  switch (path){
  case '/':
  case '/index.html':
    fs.readFile(__dirname + '/index.html', function(err, data) {
      if (err) return send404(res);
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data, 'utf8');
      res.end();
    });
    break;
  default: send404(res);
  }
}

function send404(res) {
  res.writeHead(404);
  res.write('404');
  return res.end();
}
