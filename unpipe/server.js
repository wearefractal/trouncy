var net = require('net');
var split = require('../lib/split');
var Stream = net.Stream;

var server = net.createServer(function (c) {
    split(c, function (req, stream) {
        console.dir(req.headers);
        var s = new Stream;
        s.writable = true;
        s.readable = true;
        
        s.write = function (buf) {
            console.dir([ 'DATA', buf.toString() ]);
        };
        
        s.on('end', function () {
            console.log('__END__');
        });
        
        stream.pipe(s);
        stream.resume();
    });
});
server.listen(5000);
