var http = require('http');
var parsers = require('./parsers');
var IncomingMessage = http.IncomingMessage;
var EventEmitter = require('events').EventEmitter;

var BufferedStream = require('morestreams').BufferedStream;

module.exports = function (stream, cb) {
    var parser = parsers.alloc();
    parser.reinitialize('request');
    parser.socket = stream;
    parser.incoming = null;
    
    var currentBuffer = null;
    var outgoing = null;
    var offset = 0;
    
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
console.dir([ 'write', buf.toString() ]);
        outgoing.write(buf);
        offset = start + len;
    }
    
    var onMessageBegin = parser.onMessageBegin;
    parser.onMessageBegin = function () {
        onMessageBegin();
        outgoing = new BufferedStream;
        outgoing.pause();
        offset = 0;
    };
    
    parser.onIncoming = function (req, shouldKeepAlive) {
        cb(req, outgoing);
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
        else if (!advanced && currentBuffer !== buf) {
            var b = currentBuffer.slice(offset, currentBuffer.length);
            outgoing.write(b);
            currentBuffer = buf;
            offset = 0;
        }
        advanced = false;
    });
};
