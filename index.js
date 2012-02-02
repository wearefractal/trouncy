var http = require('http');
var ServerResponse = http.ServerResponse;
var parsley = require('parsley');
var BufferedStream = require('morestreams').BufferedStream;

var insertHeaders = require('./lib/insert_headers');
var updatePath = require('./lib/update_path');
var parseArgs = require('./lib/parse_args');

var net = require('net');
var tls = require('tls');

var bouncy = module.exports = function (opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }

    if (opts && opts.key && opts.cert) {
      return tls.createServer(opts, handler.bind(null, cb));
    } else {
      return net.createServer(handler.bind(null, cb));
    }
  };

var handler = bouncy.handler = function (cb, c) {
    parsley(c, function (req) {
      c.setMaxListeners(0);

      var stream = new BufferedStream;
      stream.pause();

      function onData(buf) {
        stream.write(buf);
      }

      req.socket.on('close', function () {
        stream.end();
      });

      req.on('rawHead', onData);
      req.on('rawBody', onData);

      req.on('rawEnd', function () {
        req.removeListener('rawHead', onData);
        req.removeListener('rawBody', onData);
      });

      function onHeaders() {
        req.removeListener('error', onError);
        // don't kill the server on subsequent request errors
        req.on('error', function () {});
        var bounce = makeBounce(stream, c, req);
        cb(req, bounce);
      }
      req.on('headers', onHeaders);

      function onError(err) {
        req.removeListener('headers', onHeaders);
        var bounce = makeBounce(stream, c, req);
        cb(req, bounce);
        req.emit('error', err);
      }
      req.once('error', onError);
    });
  };

function makeBounce(bs, client, req) {
  var bounce = function (stream, opts) {
      if (!stream || !stream.write) {
        opts = parseArgs(arguments);
        stream = opts.stream;
      }
      var clstream = new BufferedStream;

      if (!opts) opts = {};
      if (opts.forward) {
        if (!opts.requestHeaders) opts.requestHeaders = {}
        if (!('x-forwarded-for' in opts.requestHeaders)) {
          opts.requestHeaders['x-forwarded-for'] = client.remoteAddress;
        }
        if (!('x-forwarded-port' in opts.requestHeaders)) {
          var m = (req.headers.host || '').match(/:(\d+)/);
          opts.requestHeaders['x-forwarded-port'] = m && m[1] || 80;
        }
        if (!('x-forwarded-proto' in opts.requestHeaders)) {
          opts.requestHeaders['x-forwarded-proto'] = client.encrypted ? 'https' : 'http';
        }
      }
      if (opts.requestHeaders) {
        insertHeaders(bs.chunks, opts.requestHeaders);
      }
      if (opts.path) {
        updatePath(bs.chunks, opts.path);
      }

      if (stream.writable && client.writable && clstream.writable) {
        //bs = buffered inbound http connection, stream = outbound net.createConnection, client = inbound http connection
        //Usually only the initial request is prebuffered to inject headers before proxying it
        //This section has been modified to pre-buffer the response from the target to inject headers before proxying it back
        stream.on('end', function (data) {
          if (opts.responseHeaders) {
            insertHeaders(clstream.chunks, opts.responseHeaders);
          }
          clstream.pipe(client);
        });

        bs.pipe(stream);
        stream.pipe(clstream);
      } else if (opts.emitter) {
        opts.emitter.emit('drop', client);
      }

      stream.on('error', function (err) {
        if (stream.listeners('error').length === 1) {
          // destroy the request and stream if nobody is listening
          req.destroy();
          stream.destroy();
        }
      });

      return stream;
    };

  bounce.respond = function () {
    var res = new ServerResponse(req);
    res.assignSocket(client);
    res.on('finish', function () {
      res.detachSocket(client);
      client.destroySoon();
    });
    return res;
  };

  return bounce;
}
