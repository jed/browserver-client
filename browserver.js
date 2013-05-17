!function() {
  var root = this
  var http = {}

  http.EventEmitter = EventEmitter
  http.Socket       = Socket
  http.Stream       = Stream
  http.Server       = Server
  http.Agent        = Agent
  http.Message      = Message
  http.Request      = Request
  http.Response     = Response

  http.globalAgent  = null
  http.STATUS_CODES = {}

  http.guid = function() {
    return Math.random().toString(36).slice(2, 15)
  }

  var previousHttp = root.http

  http.noConflict = function() {
    root.http = previousHttp

    return http
  }

  if (typeof exports == "undefined") root["http"] = http

  else {
    if (typeof module != "undefined" && module.exports) {
      exports = module.exports = http
    }

    exports.http = http
  }

  function EventEmitter() {
    this._events = {}
  }

  EventEmitter.prototype.on = function(event, fn) {
    if (typeof fn != "function") throw new TypeError

    var fns = this._events[event]

    if (!fns) fns = this._events[event] = []

    fns.push(fn)

    return this
  }

  EventEmitter.prototype.emit = function(event) {
    var fns = this._events[event]

    if (!fns) return this

    var args = fns.slice.call(arguments, 1)
    var length = fns.length

    if (event == "error" && !length) throw args[0]

    fns = fns.slice(0)

    for (var i = 0; i < length; i++) fns[i].apply(this, args)

    return this
  }

  EventEmitter.prototype.removeListener = function(event, fn) {
    var fns = this._events[event]

    if (!fns) return this

    var length = fns.length

    for (var i = 0; i < length; i++) {
      if (fns[i] == fn) { fns.splice(i, 1); break }
    }

    if (!fns.length) delete this._events[event]

    return this
  }

  EventEmitter.prototype.once = function(event, fn) {
    var self = this

    this.on(event, function proxy() {
      self.removeListener(event, proxy)
      fn.apply(this, arguments)
    })

    return this
  }

  EventEmitter.removeAllListeners = function(event) {
    if (!arguments.length) this._events = {}
    else delete this._events[event]

    return this
  }

  function Stream() {
    EventEmitter.call(this)
  }

  Stream.prototype = new EventEmitter

  Stream.prototype.body = ""

  Stream.prototype.write = function(chunk) {
    this.body += chunk
  }

  Stream.prototype.end = function(chunk) {
    if (arguments.length) this.write(chunk)

    this.emit("end")
  }

  function Socket(socket) {
    if (socket._browserver) return socket._browserver

    socket._browserver = this

    EventEmitter.call(this)

    var self = this

    socket.onopen = function() {
      self.emit("open")
    }

    socket.onmessage = function(data) {
      if ("data" in data) data = data.data

      var req = (new Request).parse(data)

      if (req) return self.emit("request", req)

      var res = (new Response).parse(data)

      if (res) self.emit("response", res)
    }

    socket.onclose = function() {
      self.emit("close")
    }

    socket.onerror = function(data) {
      self.emit("error", data)
    }

    this.socket = socket

    if (!http.globalAgent) {
      http.globalAgent = (new Agent).listen(socket)
    }

    return this
  }

  Socket.prototype = new EventEmitter

  Socket.prototype.send = function(data) {
    this.socket.send(data)
  }

  Socket.prototype.close = function() {
    this.removeAllListeners()

    this.socket.onopen    = null
    this.socket.onmessage = null
    this.socket.onclose   = null
    this.socket.onerror   = null

    delete this.socket

    return this
  }

  function Message(){}

  Message.prototype.parse = function(data) {
    var match = data.match(/\r?\n\r?\n/)

    this.body = data.slice(match.index + match[0].length)

    match = data.slice(0, match.index).split(/\r?\n/)

    this.startLine = match[0]

    var headers = this.headers = {}
    var length = match.length

    for (var i = 1; i < length; i++) {
      data = match[i].match(/^([^:]+):\s*(.+)/)

      data[1] == "x-brow-req-id"
        ? this.id = data[2]
        : headers[data[1]] = data[2]
    }

    return this
  }

  Message.prototype.serialize = function() {
    var message = this.startLine + "\r\n"

    for (var name in this.headers) {
      message += name + ": " + this.headers[name] + "\r\n"
    }

    message += "x-brow-req-id: " + this.id + "\r\n"

    return message + "\r\n" + this.body
  }

  function Request() {
    Stream.call(this)
  }

  Request.pattern = /^(\S+) (\S+) HTTP\/(\S+)$/

  Request.prototype = new Stream
  Request.prototype.httpVersion = "1.1"
  Request.prototype.parse = function(data) {
    Message.prototype.parse.call(this, data)

    var match = this.startLine.match(Request.pattern)

    if (!match) return null

    this.method      = match[1]
    this.url         = match[2]
    this.httpVersion = match[3]

    return this
  }

  Request.prototype.serialize = function() {
    this.startLine =
      this.method + " " +
      this.url + " " +
      "HTTP/" + this.httpVersion

    return Message.prototype.serialize.call(this)
  }

  function Response() {
    Stream.call(this)
  }

  Response.pattern = /^HTTP\/(\S+) (\S+) (.*)/

  Response.prototype = new Stream
  Response.prototype.httpVersion = "1.1"
  Response.prototype.writeHead = function(code, reason, headers) {
    if (typeof reason != "string") {
      headers = reason
      reason = http.STATUS_CODES[code] || ""
    }

    this.statusCode = code
    this.reasonPhrase = reason
    this.headers = headers || {}
  }

  Response.prototype.parse = function(data) {
    Message.prototype.parse.call(this, data)

    var match = this.startLine.match(Response.pattern)

    if (!match) return null

    this.httpVersion  = match[1]
    this.statusCode   = match[2]
    this.reasonPhrase = match[3]

    return this
  }

  Response.prototype.serialize = function() {
    this.startLine =
      "HTTP/" + this.httpVersion + " " +
      this.statusCode + " " +
      this.reasonPhrase

    return Message.prototype.serialize.call(this)
  }

  function Server(listener) {
    EventEmitter.call(this)

    this.responses = {}

    if (listener) this.on("request", listener)
  }

  Server.prototype = new EventEmitter

  Server.prototype.listen = function(socket, cb) {
    var server = this

    this.socket = new Socket(socket)

    this.socket.on("request", function(req) {
      var res = new Response

      res.httpVersion = req.httpVersion
      res.id = req.id

      res.once("end", function() {
        if (!server.responses[res.id]) return

        delete server.responses[res.id]
        server.socket.send(res.serialize())
      })

      server.responses[res.id] = res

      server.emit("request", req, res)

      req.emit("data", req.body)
      req.emit("end")
    })

    this.emit("listening")

    if (cb) cb()

    return this
  }

  Server.prototype.close = function() {
    this.socket.close()
  }

  http.createServer = function(fn) {
    return new Server(fn)
  }

  function Agent() {
    this.requests = {}
  }

  Agent.prototype = new EventEmitter

  Agent.prototype.listen = function(socket) {
    var requests = this.requests

    this.socket = new Socket(socket)

    this.socket.on("response", function(res) {
      var req = res && requests[res.id]

      if (!req) return

      req.emit("response", res)
      res.emit("data", res.body)
      res.emit("end")

      delete requests[res.id]
    })

    return this
  }

  Agent.prototype.send = function(request) {
    this.requests[request.id] = request

    this.socket.send(request.serialize())
  }

  http.get = function(opts, cb) {
    return http.request(opts, cb).end()
  }

  http.request = function(opts, cb) {
    var req = new Request

    if (typeof opts == "string") {
      var anchor = document.createElement("a")

      anchor.href = opts

      opts = {
        host: anchor.host,
        path: anchor.pathname + anchor.search
      }
    }

    req.id           = http.guid()
    req.url          = opts.path
    req.method       = opts.method  || "GET"
    req.headers      = opts.headers || {}
    req.headers.host = opts.host    || opts.hostname + ":" + opts.port

    req.once("end", function() {
      (opts.agent || http.globalAgent).send(req)
    })

    if (cb) req.once("response", cb)

    return req
  }
}()
