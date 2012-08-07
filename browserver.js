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

    this.requests = {}

    this.on("message", function(data) {
      data = data.data || data

      try { data = JSON.parse(data) }
      catch (error) { this.emit("error", error) }

      if (data.method) {
        var res = new ServerResponse
        res.ws = this.ws
        res.headers = {
          "x-brow-req-id": data.headers["x-brow-req-id"]
        }

        delete data.headers["x-brow-req-id"]

        this.emit("request", data, res)
      }

      else if (data.statusCode) {
        var id = data.headers["x-brow-req-id"]
        delete data.headers["x-brow-req-id"]

        var res = new ClientResponse
        res.statusCode = data.statusCode
        res.headers = data.headers
        res.body = data.body

        this.requests[id].emit("response", res)
        res.emit("data", data.body)
        res.emit("end")

        delete this.requests[id]
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

  ClientRequest.prototype.body = ""

  ClientRequest.prototype.write = function(chunk) {
    this.body += chunk
  }

  ClientRequest.prototype.end = function(chunk) {
    var self = this
    var id = Math.random().toString(36).slice(2)

    if (arguments.length) this.write(chunk)

    this.headers["x-brow-req-id"] = id
    this.agent.requests[id] = this
    this.agent.ws.send(JSON.stringify(this))
  }

  ClientRequest.prototype.toJSON = function() {
    return {
      method: this.method,
      url: this.url,
      headers: this.headers,
      body: this.body || undefined
    }
  }

  http.get = function(opts, cb) {
    return new ClientRequest(opts, cb).end()
  }

  http.request = function(opts, cb) {
    return new ClientRequest(opts, cb)
  }

  function ClientResponse(){}
  ClientResponse.prototype = new EventEmitter
}
