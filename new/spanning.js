var net = require('net');

var c = net.createConnection(5000, function () {
    c.write([
        'POST / HTTP/1.1',
        'Host: beepity.boop',
    ].join('\r\n'));
    
    setInterval(function () {
        c.write([
            'Connection: keep-alive',
            'Transfer-Encoding: chunked',
            '',
            '',
        ].join('\r\n'));
        
        var chunks = [
            '3\r\nabc\r\n',
            '2\r\nde\r\n',
            '5\r\nfghij\r\n',
            '0\r\n\r\n',
            'POST / HTTP/1.1\r\n',
            'Host: beepity.boop\r\n',
        ];
        
        var iv = setInterval(function () {
            var chunk = chunks.shift();
            c.write(chunk);
            if (chunks.length === 0) clearInterval(iv);
        }, 20);
    }, 1000);
});