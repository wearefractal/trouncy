var http = require('http');
var ServerResponse = http.ServerResponse;
var parsers = http.parsers;

var insertHeaders = require('./lib/insert_headers');
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
    }
    else {
        return net.createServer(handler.bind(null, cb));
    }
};

var handler = bouncy.handler = function (cb, c) {
    var parser = parsers.alloc();
    parser.reinitialize('request');
    parser.socket = c;
    parser.incoming = null;
    
    var request = null;
    var headers = {};
    
    parser.onIncoming = function (req, shouldKeepAlive) {
        req.pause();
        request = req;
    };
    
    parser.onHeaderValue = function (b, start, len) {
        if (!headers.buffer) headers.buffer = b;
        headers.end = start + len;
        
        var slice = b.toString('ascii', start, start + len);
        if (parser.value) {
            parser.value += slice;
        }
        else {
            parser.value = slice;
        }
    };
    
    c.on('data', function onData (buf) {
        var ret = parser.execute(buf, 0, buf.length);
        if (ret instanceof Error) {
            c.destroy();
        }
        else if (parser.incoming && parser.incoming.upgrade) {
            c.removeListener('data', onData);
            
            var req = parser.incoming;
            var bounce = respond(req, headers, c);
            cb(req, bounce);
            
            headers = {};
            request = null;
        }
        else if (request) {
            var bounce = respond(request, headers, c);
            cb(request, bounce);
            
            headers = {};
            request = null;
        }
    });
    
    c.on('close', function () {
        parsers.free(parser);
    });
    
    c.on('end', function () {
        parser.finish();
        c.destroy();
    });
};

var slash = {
    n : '\n'.charCodeAt(0),
    r : '\r'.charCodeAt(0),
};

function respond (req, headers, c) {
    if (headers.buffer[headers.end] === slash.n
    && headers.buffer[headers.end + 1] === slash.n) {
        // \n\n
        var headBuf = headers.buffer.slice(0, headers.end + 2);
    }
    else if (headers.buffer[headers.end] === slash.n
    && headers.buffer[headers.end + 2] === slash.n) {
        // \n\r\n just in case
        var headBuf = headers.buffer.slice(0, headers.end + 3);
    }
    else {
        // \r\n\r\n
        var headBuf = headers.buffer.slice(0, headers.end + 4);
    }
    
    var bounce = function (stream, opts) {
        if (!stream || !stream.write) {
            opts = parseArgs(arguments);
            stream = opts.stream;
        }
        if (!opts) opts = {};
        
        if (!opts.hasOwnProperty('headers')) opts.headers = {};
        
        if (opts.headers) {
            if (!opts.headers.hasOwnProperty('x-forwarded-for')) {
                opts.headers['x-forwarded-for'] = c.remoteAddress;
            }
            if (!opts.headers.hasOwnProperty('x-forwarded-port')) {
                var m = (req.headers.host || '').match(/:(\d+)/);
                opts.headers['x-forwarded-port'] = m && m[1] || 80;
            }
            if (!opts.headers.hasOwnProperty('x-forwarded-proto')) {
                opts.headers['x-forwarded-proto'] =
                    c.encrypted ? 'https' : 'http';
            }
        }
        
        try {
            stream.write(headBuf);
        }
        catch (err) {
            if (opts.emitter) {
                opts.emitter.emit('drop', c);
            }
            else {
                c.destroy();
            }
            return;
        }
        
        req.pipe(stream);
        stream.pipe(c);
        req.resume();
    };
    
    bounce.respond = function () {
        var res = new ServerResponse(req);
        res.assignSocket(req.socket);
        return res;
    };
    
    return bounce;
}
