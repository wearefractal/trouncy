var http = require('http');
var parsers = require('./parsers');
var IncomingMessage = http.IncomingMessage;
var EventEmitter = require('events').EventEmitter;

var BufferedStream = require('morestreams').BufferedStream;
var slash = {
    n : '\n'.charCodeAt(0),
    r : '\r'.charCodeAt(0),
};

module.exports = function (stream, cb) {
    var parser = parsers.alloc();
    parser.reinitialize('request');
    parser.socket = stream;
    parser.incoming = null;
    
    var currentBuffer = null;
    var outgoing = null;
    var offset = 0;
    
    var onMessageBegin = parser.onMessageBegin;
    parser.onMessageBegin = function () {
        onMessageBegin();
        outgoing = new BufferedStream;
        outgoing.pause();
        offset = 0;
    };
    
    var advanced = false;
    function advance (b, start, len) {
        advanced = true;
        if (currentBuffer !== b) {
            if (currentBuffer) {
                var buf = currentBuffer.slice(offset, currentBuffer.length);
                outgoing.write(buf);
            }
            currentBuffer = b;
            offset = 0;
        }
        
        var buf = currentBuffer.slice(offset, start + len);
        outgoing.write(buf);
        offset = start + len;
    }
    
    var request = null;
    parser.onIncoming = function (req, shouldKeepAlive) {
        request = req;
    };
    
    var onBody = parser.onBody;
    parser.onBody = function (b, start, len) {
        advance(b, start, len);
        onBody(b, start, len);
    };
    
    var onHeaderField = parser.onHeaderField;
    parser.onHeaderField = function (b, start, len) {
        advance(b, start, len);
        onHeaderField(b, start, len);
    };
    
    var onHeaderValue = parser.onHeaderValue;
    parser.onHeaderValue = function (b, start, len) {
        advance(b, start, len);
        onHeaderValue(b, start, len);
    };
    
    var onHeadersComplete = parser.onHeadersComplete;
    parser.onHeadersComplete = function (info) {
        onHeadersComplete(info);
        
        var b = currentBuffer;
        if (!b) return;
        for (var i = offset; i < b.length - 3; i++) {
            if (b[i+2] === slash.n && b[i+3] === slash.n) {
                advance(b, i + 2, 2); // \n\n
            }
            else if (b[i] === slash.r && b[i+1] === slash.n
            && b[i+2] === slash.r && b[i+3] === slash.n) {
                advance(b, i, 4); // \r\n\r\n
            }
            else if (b[i+1] === slash.n && b[i+2] === slash.r
            && b[i+3] === slash.n) {
                advance(b, i, 3); // \n\r\n
            }
        }
    };
    
    var complete = false;
    var onMessageComplete = parser.onMessageComplete;
    parser.onMessageComplete = function () {
        onMessageComplete();
        complete = true;
    };
    
    stream.on('data', function (buf) {
        var ret = parser.execute(buf, 0, buf.length);
        if (ret instanceof Error) {
            c.destroy();
        }
        else {
            if (!advanced && currentBuffer && currentBuffer !== buf) {
                var b = currentBuffer.slice(offset, currentBuffer.length);
                outgoing.write(b);
                currentBuffer = buf;
                offset = 0;
            }
            if (request) {
                cb(request, outgoing);
                request = null;
            }
        }
        advanced = false;
    });
    
    stream.on('close', function () {
        parsers.free(parser);
    });
    
    stream.on('end', function () {
        parser.finish();
        stream.destroy();
    });
};
