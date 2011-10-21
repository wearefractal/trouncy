var net = require('net');
var split = require('../lib/split');
var Stream = net.Stream;

var server = net.createServer(function (c) {
    split(c, function (req, stream) {
        var s = new Stream;
        s.writable = true;
        s.readable = true;
        
        s.write = function (buf) {};
        
        s.on('end', function () {});
        
        stream.pipe(s);
        stream.resume();
    });
});
server.listen(5000);
