var http = require('http');
var parsers = http.parsers;
var net = require('net');

var server = net.createServer(function (c) {
    var parser = parsers.alloc();
    parser.reinitialize('request');
    parser.socket = c;
    parser.incoming = null;
    
    var request = null;
    var inBody = false;
    
    parser.onIncoming = function (req, shouldKeepAlive) {
        console.log(req.headers.host + ' ' + req.url);
        
        var s = '';
        req.on('data', function (buf) {
            s += buf.toString();
        });
        
        req.on('end', function () {
            console.dir(s);
        });
        
        request = req;
        inBody = false;
    };
    
    parser.onBody = function (b, start, len) {
        if (!inBody) {
            var headers = b.slice(0, start - len).toString();
            console.dir(headers);
        }
        inBody = true;
        
        var slice = b.slice(start, start + len);
        if (parser.incoming._decoder) {
            var string = parser.incoming._decoder.write(slice);
            if (string.length) parser.incoming.emit('data', string);
        }
        else {
            parser.incoming.emit('data', slice)
        }
    };
    
    c.on('data', function (buf) {
        var ret = parser.execute(buf, 0, buf.length);
        console.log('ret=' + ret + ' (' + buf.length + ')');
        
        if (ret instanceof Error) {
            c.destroy();
        }
        else if (parser.incoming && parser.incoming.upgrade) {
            // web sockets
        }
        else if (request) {
            console.log('ret = ' + ret);
            request = null;
        }
    });
});

server.listen(5000);
