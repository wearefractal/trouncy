var http = require('http');
var parsers = http.parsers;
var net = require('net');

var slash = {
    n : '\n'.charCodeAt(0),
    r : '\r'.charCodeAt(0),
};

var server = net.createServer(function (c) {
    var parser = parsers.alloc();
    parser.reinitialize('request');
    parser.socket = c;
    parser.incoming = null;
    
    var request = null;
    var headers = {};
    
    parser.onIncoming = function (req, shouldKeepAlive) {
        var s = '';
        req.on('data', function (buf) {
            s += buf.toString();
        });
        
        req.on('end', function () {
            console.dir(s);
        });
        
        if (headers && headers.buffer && headers.end) {
            if (headers.buffer[headers.end] === slash.n
            && headers.buffer[headers.end + 1] === slash.n) {
                // \n\n
                var buf = headers.buffer.slice(0, headers.end + 2);
            }
            else {
                // \r\n\r\n
                var buf = headers.buffer.slice(0, headers.end + 4);
            }
            console.dir(buf.toString());
        };
        
        request = req;
        headers = {};
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
    
    c.on('data', function (buf) {
        var ret = parser.execute(buf, 0, buf.length);
        
        if (ret instanceof Error) {
            c.destroy();
        }
        else if (parser.incoming && parser.incoming.upgrade) {
            // web sockets
        }
        else if (request) {
            request = null;
        }
    });
});

server.listen(5000);
