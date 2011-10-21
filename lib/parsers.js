// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var FreeList = require('freelist').FreeList;
var HTTPParser = process.binding('http_parser').HTTPParser;
var http = require('http');
var IncomingMessage = http.IncomingMessage;

module.exports = new FreeList('parsers', 1000, function() {
  var parser = new HTTPParser('request');

  parser.onMessageBegin = function() {
    parser.incoming = new IncomingMessage(parser.socket);
    parser.field = null;
    parser.value = null;
  };

  // Only servers will get URL events.
  parser.onURL = function(b, start, len) {
    var slice = b.toString('ascii', start, start + len);
    if (parser.incoming.url) {
      parser.incoming.url += slice;
    } else {
      // Almost always will branch here.
      parser.incoming.url = slice;
    }
  };

  parser.onHeaderField = function(b, start, len) {
    var slice = b.toString('ascii', start, start + len).toLowerCase();
    if (parser.value != undefined) {
      parser.incoming._addHeaderLine(parser.field, parser.value);
      parser.field = null;
      parser.value = null;
    }
    if (parser.field) {
      parser.field += slice;
    } else {
      parser.field = slice;
    }
  };

  parser.onHeaderValue = function(b, start, len) {
    var slice = b.toString('ascii', start, start + len);
    if (parser.value) {
      parser.value += slice;
    } else {
      parser.value = slice;
    }
  };

  parser.onHeadersComplete = function(info) {
    if (parser.field && (parser.value != undefined)) {
      parser.incoming._addHeaderLine(parser.field, parser.value);
      parser.field = null;
      parser.value = null;
    }

    parser.incoming.httpVersionMajor = info.versionMajor;
    parser.incoming.httpVersionMinor = info.versionMinor;
    parser.incoming.httpVersion = info.versionMajor + '.' + info.versionMinor;

    if (info.method) {
      // server only
      parser.incoming.method = info.method;
    } else {
      // client only
      parser.incoming.statusCode = info.statusCode;
    }

    parser.incoming.upgrade = info.upgrade;

    var isHeadResponse = false;

    if (!info.upgrade) {
      // For upgraded connections, we'll emit this after parser.execute
      // so that we can capture the first part of the new protocol
      isHeadResponse = parser.onIncoming(parser.incoming, info.shouldKeepAlive);
    }

    return isHeadResponse;
  };

  parser.onBody = function(b, start, len) {
    // TODO body encoding?
    var slice = b.slice(start, start + len);
    if (parser.incoming._decoder) {
      var string = parser.incoming._decoder.write(slice);
      if (string.length) parser.incoming.emit('data', string);
    } else {
      parser.incoming.emit('data', slice);
    }
  };

  parser.onMessageComplete = function() {
    parser.incoming.complete = true;
    if (parser.field && (parser.value != undefined)) {
      parser.incoming._addHeaderLine(parser.field, parser.value);
    }
    if (!parser.incoming.upgrade) {
      // For upgraded connections, also emit this after parser.execute
      parser.incoming.readable = false;
      parser.incoming.emit('end');
    }
  };

  return parser;
});
