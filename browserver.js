new function browserver() {
  var root = function(){ return this }()
  var http = this

  http.EventEmitter   = EventEmitter
  http.Server         = Server
  http.WebSocket      = WebSocket
  http.ServerRequest  = ServerRequest
  http.ServerResponse = ServerResponse
  http.ClientRequest  = ClientRequest
  http.ClientResponse = ClientResponse

  http.globalAgent    = null
  http.source         = "new " + browserver

  if (typeof exports == "undefined") root["http"] = http

  else {
    if (typeof module != "undefined" && module.exports) {
      exports = module.exports = http
    }

    exports.http = http
  }

  var previousHttp = root.http
  http.noConflict = function() {
    root.http = previousHttp

    return this
  }

  function EventEmitter() {
    this._events = {}
  }

  EventEmitter.prototype.on = function(event, fn) {
    var fns = this._events[event]

    fns
      ? fns.push(fn)
      : this._events[event] = [fn]

    return this
  }

  EventEmitter.prototype.emit = function(event) {
    var fns = this._events[event] || []
      , args = fns.slice.call(arguments, 1)
      , length = fns.length
      , i = 0

    if (event == "error" && !length) throw args[0]

    while (i < length) fns[i++].apply(this, args)

    return this
  }

  EventEmitter.prototype.removeListener = function(fn) {
    var fns = this._events[event]
      , i = fns && fns.length

    while (i--) if (fns[i] == fn) break

    if (i >= 0) fns.splice(i, 1)

    if (fns && !fns.length) delete this._events[event]

    return this
  }

  EventEmitter.prototype.once = function(event, fn) {
    function proxy() {
      fn.apply(this, arguments)
      this.removeListener(event, proxy)
    }

    return this.on(event, proxy)
  }

  EventEmitter.removeAllListeners = function(event) {
    event
      ? delete this._events[event]
      : this._events = {}

    return this
  }

  function WebSocket(ws) {
    if (!ws) throw new Error("No WebSocket specified.")

    if (ws.browserver) return ws.browserver

    var self = this

    if (!http.globalAgent) http.globalAgent = this

    EventEmitter.call(this)

    ws.onopen    = function(    ){ self.emit("open") }
    ws.onmessage = function(data){ self.emit("message", data) }
    ws.onclose   = function(    ){ self.emit("close") }
    ws.onerror   = function(data){ self.emit("error", data) }

    this.requests = {}

    this.on("message", function(data) {
      data = data.data || data

      var req, res

      if (data.charCodeAt(0) == 72) {
        res = new ClientResponse
        res.parse(data)

        var id = res.headers["x-brow-req-id"]
        this.requests[id].emit("response", res)
        delete this.requests[id]

        res.emit("data", res._body)
        res.emit("end")
      }

      else {
        req = new ServerRequest
        req.parse(data)

        res = new ServerResponse
        res.ws = this.ws
        res.httpVersion = req.httpVersion
        res.headers = {
          "x-brow-req-id": req.headers["x-brow-req-id"]
        }

        this.emit("request", req, res)
        req.emit("data", req._body)
        req.emit("end")
      }
    })

    this.ws = ws
    ws.browserver = this

    return this
  }

  WebSocket.prototype = new EventEmitter

  WebSocket.prototype.close = function() {
    this.removeAllListeners()

    this.ws.onopen = null
    this.ws.onmessage = null
    this.ws.onclose = null
    this.ws.onerror = null

    delete this.ws

    return this
  }

  this.createServer = function(fn){ return new Server(fn) }

  function Server(listener) {
    EventEmitter.call(this)

    if (listener) this.on("request", listener)
  }

  Server.prototype = new EventEmitter

  Server.prototype.listen = function(ws, cb) {
    var self = this

    this.ws = new WebSocket(ws)

    this.ws.on("request", function(req, res) {
      self.emit("request", req, res)
    })

    this.emit("listening")

    if (cb) cb()

    return this
  }

  function ServerRequest() {}
  ServerRequest.prototype = new EventEmitter
  ServerRequest.prototype.parse = parseHTTP

  function ServerResponse(){}
  ServerResponse.prototype.serialize = serializeHTTP
  ServerResponse.prototype.statusCode = 200
  ServerResponse.prototype._body = ""

  ServerResponse.prototype.writeHead = function(statusCode, reason, headers) {
    if (typeof reason != "string") headers = reason, reason = ""

    this.statusCode = statusCode
    this.reason = reason

    for (var key in headers) this.headers[key] = headers[key]
  }

  ServerResponse.prototype.write = function(chunk) {
    if (typeof chunk != "string") {
      throw new Error("Response must be a string.")
    }

    this._body += chunk
  }

  ServerResponse.prototype.end = function(chunk) {
    if (arguments.length) this.write(chunk)

    this.ws.send(this.serialize())
  }

  var anchor = root.document && document.createElement("a")

  function ClientRequest(opts, cb) {
    if (typeof opts == "string") {
      anchor.href = opts
      opts        = {}

      opts.hostname = anchor.hostname
      opts.port     = anchor.port
      opts.path     = anchor.pathname + anchor.search
    }

    this.url = opts.path
    this.method = opts.method || "GET"
    this.headers = {host: opts.hostname}

    if (opts.port) this.headers.host += ":" + opts.port

    this.agent = opts.agent || http.globalAgent

    this.once("response", cb)
  }

  ClientRequest.prototype = new EventEmitter
  ClientRequest.prototype.serialize = serializeHTTP

  ClientRequest.prototype._body = ""

  ClientRequest.prototype.write = function(chunk) {
    this._body += chunk
  }

  ClientRequest.prototype.end = function(chunk) {
    var self = this
    var id = Math.random().toString(36).slice(2)

    if (arguments.length) this.write(chunk)

    this.headers["x-brow-req-id"] = id
    this.agent.requests[id] = this

    console.log(this.serializeHTTP())
    this.agent.ws.send(this.serializeHTTP())
  }

  function ClientResponse(){}
  ClientResponse.prototype = new EventEmitter
  ClientResponse.prototype.parse = parseHTTP

  function parseHTTP(data) {
    var pattern = /\r?\n/g
    var headers = this.headers = {}
    var match = pattern.exec(data)
    var start = 0
    var end = match.index
    var row = data.slice(start, end).split(" ")

    if (row[1] > 0) {
      this.httpVersion = row[0].slice(5)
      this.statusCode = +row[1]
      this.reason = row[2]
    }

    else {
      this.method = row[0]
      this.url = row[1]
      this.httpVersion = row[2].slice(5)
    }

    while (true) {
      start = end + match[0].length
      match = pattern.exec(data)
      end = match.index
      row = data.slice(start, end)

      if (!row) break

      start = row.match(/:\s*/)
      headers[row.slice(0, start.index)] = row.slice(start.index + start[0].length)
    }

    this._body = data.slice(end + match[0].length)

    return this
  }

  var CRLF = "\r\n"

  function serializeHTTP() {
    var data = this.statusCode
      ? "HTTP/" + this.httpVersion + " " + this.statusCode
      : this.method + " " + this.url + " HTTP/" + this.httpVersion

    data += CRLF

    for (var name in this.headers) {
      data += name + ": " + this.headers[name] + CRLF
    }

    data += CRLF + this._body

    return data
  }

  http.get = function(opts, cb) {
    return new ClientRequest(opts, cb).end()
  }

  http.request = function(opts, cb) {
    return new ClientRequest(opts, cb)
  }
}
