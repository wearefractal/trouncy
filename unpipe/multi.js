var net = require('net');

var c = net.createConnection(5000, function () {
    for (var i = 0; i < 3; i++) {
        c.write([
            'POST / HTTP/1.1',
            'Host: beepity.boop',
            'Connection: keep-alive',
            'Transfer-Encoding: chunked',
            '',
            '3', 'abc',
            '2', 'de',
            '5', 'fghij',
            '0', '',
            ''
        ].join('\r\n'));
    }
});
