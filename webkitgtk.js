var util = require('util');
var events = require('events');
var stream = require('stream');
var fs = require('fs');
var path = require('path');
var url = require('url');

var RUN_SYNC = 0;
var RUN_ASYNC = 1;
var RUN_PATH = 2;

function WebKit(uri, opts, cb) {
	if (!(this instanceof WebKit)) return new WebKit(uri, opts, cb);
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = {};
	}
	if (typeof uri != "string") {
		opts = uri;
		uri = null;
	}
	if (!cb) cb = noop;
	opts = opts || {};
	this.looping = 0;
	this.ticket = 0;
	var self = this;
	this.display(opts.display || 0, opts, function(err, display) {
		if (err) return cb(err);
		process.env.DISPLAY = ":" + display;
		var Bindings = require(__dirname + '/lib/webkitgtk.node');
		self.webview = new Bindings({
			webextension: __dirname + '/lib/ext',
			requestListener: requestDispatcher.bind(self),
			responseListener: responseDispatcher.bind(self)
		});
		if (uri) self.load(uri, opts, cb);
	});
}
util.inherits(WebKit, events.EventEmitter);

WebKit.prototype.display = function(display, opts, cb) {
	var self = this;
	fs.exists('/tmp/.X' + display + '-lock', function(exists) {
		if (exists) return cb(null, display);
		if (display == 0) return cb("Error - do not spawn xvfb on DISPLAY 0");
		if (opts.xfb) {
			console.log("Unsafe xfb option is spawning xvfb...");
			require('headless')({
				display: {
					width: opts.xfb.width || 1024,
					height: opts.xfb.height || 768,
					depth: opts.xfb.depth || 32
				}
			}, display, function(err, child, display) {
				cb(err, display);
				if (!err) process.on('exit', function() {
					child.kill();
				});
			});
		}
	});
};

function Request(uri) {
	this.uri = uri;
}

function requestDispatcher(uri) {
	if (this.preloading && uri != this.webview.uri) {
		return;
	}
	if (this.allow == "none") {
		if (uri != this.webview.uri) return;
	} else if (this.allow == "same-origin") {
		if (url.parse(uri).host != url.parse(this.webview.uri).host) return;
	} else if (this.allow instanceof RegExp) {
		if (!this.allow.test(uri)) return;
	}
	var req = new Request(uri);
	this.emit('request', req, this);
	return req.uri;
}

function responseDispatcher(webResponse) {
	if (this.preloading) return;
	this.emit('response', webResponse, this);
}

function noop(err) {
	if (err) console.error(err);
}

WebKit.prototype.load = function(uri, opts, cb) {
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = {};
	} else if (!opts) {
		opts = {};
	}
	if (!cb) cb = noop;
	this.allow = opts.allow || "all";
	this.preload(uri, opts, cb);
	var self = this;
	(function(next) {
		if (opts.stylesheet) {
			fs.readFile(opts.stylesheet, function(err, css) {
				if (err) console.error(err);
				if (opts.css) console.error("stylesheet option overwrites css option");
				if (css) opts.css = css;
				next();
			});
		} else {
			next();
		}
	})(function() {
		self.loop(true);
		self.webview.load(uri, opts, function(err) {
			self.loop(false);
			if (!self.preloading) cb(err, self);
			self.run(function(done) {
				// this function is executed in the window context of the current view - it cannot access local scopes
				if (/interactive|complete/.test(document.readyState)) done(null, document.readyState);
				else document.addEventListener('DOMContentLoaded', function() { done(null, "interactive"); }, false);
			}, function(err, result) {
				if (err) console.error(err);
				self.readyState = result;
				var prefix = self.preloading ? "pre" : "";
				self.emit(prefix + 'ready', self);
				if (result == "complete") {
					self.emit(prefix + 'load', self);
				}	else {
					self.run(function(done) {
						if (document.readyState == "complete") done(null, document.readyState);
						else window.addEventListener('load', function() { done(null, "complete"); }, false);
					}, function(err, result) {
						if (err) console.error(err);
						self.readyState = result;
						self.emit(prefix + 'load', self);
					});
				}
			});
		});
	});
	this.uri = uri;
	return this;
};

WebKit.prototype.unload = function(cb) {
	this.load('about:blank', cb);
	delete this.uri;
	delete this.readyState;
};

WebKit.prototype.loop = function(start, block) {
	if (start) {
		this.looping++;
	} else if (start === false) {
		this.looping--;
	}
	if (!this.looping) return;
	var self = this;
	this.webview.loop(block);
	if (!self.timeoutId) self.timeoutId = setTimeout(function() {
		self.timeoutId = null;
		self.loop(null, block);
	}, 20);
};

WebKit.prototype.run = function(script, cb) {
	if (typeof script == "function") script = script.toString();
	cb = cb || noop;

	var mode = RUN_SYNC;
	if (/^\s*function(\s+\w+)?\s*\(\s*\w+\s*\)/.test(script)) mode = RUN_ASYNC;
	else if (/^(file|http|https):/.test(script)) mode = RUN_PATH;

	var self = this;
	setImmediate(function() {
		if (mode == RUN_SYNC) {
			if (/^\s*function(\s+\w+)?\s*\(\s*\)/.test(script)) script = '(' + script + ')()';
			var ticket = "runticket" + self.ticket++;
			self.loop(true);
			self.webview.run(ticket, true, script, null, function(err, str) {
				self.loop(false);
				cb(err, str);
			});
		} else if (mode == RUN_ASYNC) {
			var ticket = "runticket" + self.ticket++;
			var fun = 'function(err, result) {\
				var ticket = "' + ticket + '";\
				window[ticket] = [err, result];\
				setTimeout(function() {document.title = ticket;}, 0);\
				return "nothing";\
			}';
			var wrapped = '(' + script + ')(' + fun + ')';
			var retrieve = '(function(ticket) {\
				var str = JSON.stringify(window[ticket] || null);\
				window[ticket] = undefined;\
				return str;\
			})("' + ticket + '")';
			self.loop(true);
			self.webview.run(ticket, false, wrapped, retrieve, function(err, json) {
				self.loop(false);
				if (err) return cb(err);
				var result = JSON.parse(json);
				if (Array.isArray(result) && result.length == 2) {
					cb.apply(null, result);
				} else {
					cb("bindings returned wrong data");
				}
			});
		} else if (mode == RUN_PATH) {
			console.log("TODO");
		}
	});
	return this;
};

function save(rstream, filename, cb) {
	cb = cb || noop;
	var wstream = fs.createWriteStream(filename);
	rstream.pipe(wstream).on('finish', cb).on('error', cb);
	return this;
}

WebKit.prototype.png = function() {
	var self = this;
	function close(err) {
		self.loop(false);
	}
	var passthrough = new stream.PassThrough();
	passthrough.save = save.bind(this, passthrough);
	if (!this.readyState || this.readyState == "loading") {
		this.on('load', function() {
			self.png().pipe(passthrough);
		});
	} else {
		this.loop(true, true);
		this.webview.png(function(err, buf) {
			if (err) {
				self.loop(false);
				passthrough.emit('error', err);
			}
			else if (buf == null) {
				self.loop(false);
				passthrough.end();
			} else {
				passthrough.write(buf);
			}
		});
	}
	return passthrough;
};

WebKit.prototype.html = function(cb) {
	if (!this.readyState || this.readyState == "loading") {
		this.on('ready', function(view) {
			view.html(cb);
		});
	} else {
		this.run("document.documentElement.outerHTML;", cb);
	}
	return this;
};

WebKit.prototype.pdf = function(filepath, opts, cb) {
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = {};
	} else if (!opts) {
		opts = {};
	}
	if (!cb) cb = noop;
	var self = this;
	if (!this.readyState || this.readyState == "loading") {
		this.on('load', function() {
			self.pdf(filepath, opts, cb);
		});
	} else {
		this.loop(true, true);
		this.webview.pdf("file://" + path.resolve(filepath), opts, function(err) {
			self.loop(false);
			cb(err);
		});
	}
	return this;
};

WebKit.prototype.preload = function(uri, opts, cb) {
	if (!opts.cookies || this.preloading !== undefined) return;
	this.preloading = true;
	this.once('preload', function(view) {
		var cookies = opts.cookies;
		if (!Array.isArray(cookies)) cookies = [cookies];
		var script = cookies.map(function(cookie) {
			return 'document.cookie = "' + cookie.replace(/"/g, '\\"') + '"';
		}).join(';') + ';';
		view.run(script, function(err) {
			if (err) return cb(err);
			view.preloading = false;
			view.load(uri, opts, cb);
		});
	});
};

module.exports = WebKit;
