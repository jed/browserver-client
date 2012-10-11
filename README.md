෴ browserver-client ෴
========================

This is a [browserver](http://browserver.org) client, for the browser.

browserver-client exposes the important bits of the [node.js](http://nodejs.org) [http API](http://nodejs.org/docs/latest/api/all.html#all_http) in the browser, allowing it to receive incoming HTTP requests and make outgoing HTTP requests via WebSockets.

This library, along with [browserver-node](https://github.com/jed/browserver-node), is all the code you need to set up your own browserver.

Example
-------

In `index.html`:

```html
<!doctype html>
<html>
  <head>
    <title>My Browserver App</title>
    <script src="/optional/path/to/websocket-shim"></script>
    <script src="/path/to/browserver"></script>
    <script src="/app.js"></script>
  </head>
</html>
```

In `app.js`:

```javascript
// to handle incoming HTTP requests,
// use the standard node.js http.Server API
var server = http.createServer(function(req, res) {
  if (req.method != "GET") {
    res.writeHead(405, {"Content-Type": "text/plain"})
    return res.end("Method not allowed")
  }

  var pathname = req.url.split("?")[0]

  if (pathname != "/hello") {
    res.writeHead(404, {"Content-Type": "text/plain"})
    return res.end("Not found.")
  }

  res.writeHead(200, {"Content-Type": "text/plain"})
  res.end("Hello, world!")
})

// establish a WebSocket (or compatible) connection,
// in this case using engine.io
var ws = new eio.Socket({host: "myserver.com"})

// bind the browserver HTTP server to the WebSocket
// and wait for connections from the browserver proxy!
server.listen(ws)

// to make outgoing HTTP requests w/o cross-domain issues,
// use http.get or http.request
http.get("http://www.google.com/index.html", function(res) {
  console.log("Google answered back!")
})
```

API
---

The browserver-client API is basically a port of the node.js [http API](http://nodejs.org/docs/latest/api/all.html#all_http), with a few caveats:

- Streaming is not supported. This means a `ServerRequest` or `ClientResponse` will only emit one `data` event, and that multiple calls to the `write` method of a `ServerResponse` or `ClientRequest` will be buffered locally and sent when `end` is called. The `data` events are provided for compatibility, but aren't technically needed, since the body itself is stored on the `body` property of the `ServerRequest` or `ClientResponse`.

- The aspects of the node.js implementation that don't map well to the browser (such as `writeContinue` and `addTrailers` methods, and client agents) have been omitted.

Otherwise, if there is a method or behavior that differs from what you'd expect on node.js, please [file an issue](https://github.com/jed/browserver-client/issues).

TODO
----

- Include more client tests in the phantomjs tests run for [browserver-node](https://github.com/jed/browserver-node)
- Make an exhaustive list of the HTTP APIs supported and not supported.
- Consider enabling support for `addEventListener` events.
