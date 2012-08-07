new function browserver() {
  var root = function(){ return this }()
  var http = this

  http.EventEmitter   = EventEmitter
  http.Server         = Server
  http.WebSocket      = WebSocket
  http.ServerResponse = ServerResponse
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
    if (!JSON) throw new Error("JSON is required")

    if (ws.browserver) return ws.browserver

    var self = this

    if (!http.globalAgent) http.globalAgent = this

    EventEmitter.call(this)

    ws.onopen    = function(    ){ self.emit("open") }
    ws.onmessage = function(data){ self.emit("message", data) }
    ws.onclose   = function(    ){ self.emit("close") }
    ws.onerror   = function(data){ self.emit("error", data) }

    this.on("message", function(data) {
      var req = data.data || data

      try { req = JSON.parse(req) }
      catch (error) { this.emit("error", error) }

      if (req.method) {
        var res = new ServerResponse
        res.ws = this.ws
        res.headers = {
          "x-brow-req-id": req.headers["x-brow-req-id"]
        }

        delete req.headers["x-brow-req-id"]

        this.emit("request", req, res)
      }

      else if (req.statusCode) {
        // handle http client response
      }

      else this.emit("error", new Error("Unrecognized message."))
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

  function ServerResponse(){}

  ServerResponse.prototype.statusCode = 200
  ServerResponse.prototype.body = ""

  ServerResponse.prototype.writeHead = function(statusCode, headers) {
    this.statusCode = statusCode

    for (var key in headers) this.headers[key] = headers[key]
  }

  ServerResponse.prototype.write = function(chunk) {
    if (chunk != Object(chunk)) {
      chunk = JSON.stringify(chunk)
      this.headers["Content-Type"] = "application/json"
    }

    if (typeof chunk != "string") {
      throw new Error("Response must be a string.")
    }

    this.body += chunk
  }

  ServerResponse.prototype.end = function(chunk) {
    if (arguments.length) this.write(chunk)

    this.send()
  }

  ServerResponse.prototype.send = function() {
    this.ws.send(JSON.stringify(this))
  }

  ServerResponse.prototype.toJSON = function() {
    return {
      statusCode: this.statusCode,
      headers: this.headers,
      body: this.body
    }
  }
}
