var http = require('http');
var ServerResponse = http.ServerResponse;
var IncomingMessage = http.IncomingMessage;

var net = require('net');
var tls = require('tls');

var insertHeaders = require('./lib/insert_headers');
var parseArgs = require('./lib/parse_args');
var split = require('./lib/split');

var bouncy = module.exports = function (opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = {};
    }
    
    if (opts && opts.key && opts.cert) {
        return tls.createServer(opts, handler.bind(null, cb));
    }
    else {
        return net.createServer(handler.bind(null, cb));
    }
};

var handler = bouncy.handler = function (cb, client) {
    split(client, function (req, stream) {
        cb(req, makeBounce(req, stream, client));
    });
};

function makeBounce (req, stream, client) {
    var bounce = function (remote, opts) {
        if (!remote || !remote.write) {
            opts = parseArgs(arguments);
            remote = opts.stream;
        }
        if (!opts) opts = {};
        if (!opts.headers) opts.headers = {};
        
        if (opts.headers['x-forwarded-for'] !== false) {
            opts.headers['x-forwarded-for'] = client.remoteAddress;
        }
        if (opts.headers['x-forwarded-port'] !== false) {
            var m = (req.headers.host || '').match(/:(\d+)/);
            opts.headers['x-forwarded-port'] = m && m[1] || 80;
        }
        if (opts.headers['x-forwarded-proto'] !== false) {
            opts.headers['x-forwarded-proto']
                = client.encrypted ? 'https' : 'http';
        }
        
        var len = insertHeaders(stream.chunks, opts.headers);
        
        stream.pipe(remote);
        remote.pipe(client);
        
        stream.resume();
        client.resume();
        remote.resume();
    };
    
    bounce.respond = function () {
        var res = new ServerResponse(req);
        res.assignSocket(req.socket);
        return res;
    };
    
    return bounce;
}
