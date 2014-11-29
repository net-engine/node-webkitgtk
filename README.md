node-webkitgtk
==============

Pilot webkitgtk from Node.js with a simple API.

*this module uses only system-installed, shared libraries*  
it doesn't embed static libraries at all.

usage
-----

A chainable API:

```js
WebKit().load('http://github.com')
  .wait('ready')
  .html(function(err, str) { console.log(str); })
  .wait('load')
  .png('github.png')
  .wait('idle')
  .pdf('github.pdf')
  .on('authenticate', function(auth) {
    auth.use('mylogin', 'mypass');
  }).on('request', function(req) {
    req.cancel = /\.js($|\?)/.test(req.uri) || req.headers.Origin
      || req.headers.Accept == "*/*";
  }).on('response', function(res) {
    console.log(res.status, res.uri);
    res.data(function(err, data) {
      console.log("got", data.length, "bytes");
    });
  });
```


which is derived from the basic API using `chainit3`:

```js
var WebKit = require('webkitgtk');
var view = new WebKit();
var fs = require('fs');
view.init({
  width: 1024,
  height: 768,
  display: "99"
}, function(err, view) {
  view.load(uri, {
    style: fs.readFileSync('css/png.css') // useful stylesheet for snapshots
  }, function(err) {
    if (err) console.error(err);
  }).on('load', function() {
    this.png().save('test.png', function(err) {
      if (err) console.error(err);
      else console.log("screenshot saved", uri);
    });
  });
});
```

A facility for choosing/spawning a display using xvfb

```js
// this spawns xvfb instance
WebKit("1024x768x16:99").load("http://github.com").png('test.png');

// this uses a pre-existing display
WebKit(98).load("http://google.com")

// use pre-existing display 0 by default
Webkit().load("http://webkitgtk.org").html(function(err, html) {
  // dump html
  console.log(html);
});
```

See test/ for more examples.


use cases
---------

This module is specifically designed to run 'headless'.
Patches are welcome for UI uses, though.

* snapshotting service (in combination with 'gm' module)

* print to pdf service (in combination with 'gs' module)

* static web page rendering

* long-running web page as a service with websockets or webrtc
  communications


load() options
--------------

- cookies  
  string | [string], default none  
  caution: cookies are saved

- width  
  number, 1024
- height  
  number, 768  
  the viewport

- allow  
  "all" or "same-origin" or "none" or a RegExp, default "all"  
  allow requests only matching option (except the document request),
  bypassing 'request' event.  
  This does not allow requests that are rejected by cross-origin policy.

- navigation  
  boolean, default false  
  allow navigation within the webview (changing document.location).

- dialogs  
  boolean, default false  
  allow display of dialogs.

- content  
  string, default null  
  load this content with the given base uri.

- script  
  string, default null  
  insert script at the beginning of loaded document.

- style  
  string, default null  
  insert user stylesheet, see  
  http://www.w3.org/TR/CSS21/cascade.html#cascading-order

- ua  
  user-agent string, default to "Mozilla/5.0"

- timeout  
  number, default 30000  
  timeout for load(), in milliseconds

- stall  
  number, default 1000  
  requests not receiving data for `stall` milliseconds are not taken into
  account for deciding `idle` events.


init() options
--------------

- display  
  number, 0  
  checks an X display or framebuffer is listening on that port

- width  
  number, 1024
- height  
  number, 768
  Framebuffer dimensions
- depth  
  number, 32
  Framebuffer pixel depth

- WIDTHxHEIGHTxDEPTH:PORT  
  string, null  
  a short-hand notation for passing all these options at once.

- cacheDir  
  string, $user_cache_dir/node-webkitgtk  
  path to webkitgtk cache directory.  
  Changing cacheDir can fail silently if webkitgtk lib is already initialized.
  The simplest way to clear the cache is to delete this directory.

- debug  
  boolean, default false  
  shows a real window with a web inspector and breaks as early as possible.  
  As a commodity, *the inspector must be closed* to get the `idle` event fired.

If width, height, depth options are given, an xvfb instance listening
given display port will be spawn using `headless` module.

It is advised and safer to monitor xvfb using a proper daemon tool.


events
------

All events are on the WebKit instance.

These are lifecycle events:

* ready  
  same as document's DOMContentLoaded event  
  listener()

* load  
  same as window's load event  
  listener()

* idle  
  when all requests are finished, failed, or just hanging, and when the
  gtk loop has been doing nothing for a couple of cycles.  
  This event is used to automatically pause the view.  
  Use .on('idle', function() { this.loop(true); }) to restart the gtk
  loop if needed.

* unload  
  same as window's unload event  
  listener()

These events happen *once* and *in that order*.

Registering a listener for an event that just happened immediately calls the
new listener.

Registering a listener for a previous event throws an error.


These events can happen at any moment:

* error  
  this is what is caught by window.onerror  
  listener(message, url, line, column)

* request  
  listener(req) where req.uri, req.cancel, req.headers are read/write.  
  req.cancel stops the request.  
  The request is not yet sent, so all values can be modified.

* response  
  listener(res)  
  res have read-only properties uri, mime, status, length, filename, headers.  
  res.data(function(err, buf)) fetches the response data.

* authenticate  
  listener(request) where request.host, request.port, request.realm are
  read-only.  
  request.use(username, password) authenticates asynchronously,  
  request.ignore() ignores request asynchronously.


methods
-------

* new Webkit()  
  creates an unitialized instance upon which init() must be called.  
  WebKit is also an EventEmitter.

* WebKit([opts])  
  create an instance with the chainable API using `chainit`.  
  If arguments are given, equals `WebKit().init(opts)`

* init([opts], cb)  
  see parameters described above  
  *must be invoked first*

* preload(uri, [opts], [cb])  
  load uri into webview  
  scripts are not run, resources are not loaded.  
  These options are not effective: `cookies`, `script`, `allow`.  
  Only `ready` event is meaningful.

* load(uri, [opts], [cb])  
  load uri into webview  
  see parameters described above

* wait(event, cb)  
  analogous to once(event, cb) except that it is usable in the chainable API.  
  It is useful before calling html, png, pdf methods: `.wait('load').png(...)`.

* run(sync-script, cb)  
  any synchronous script text or global function

* run(async-script, cb)  
  async-script must be a function that calls its first and only argument,  
  like `function(done) { done(err, str); }`

* runev(async-script, cb)  
  async-script must be a function that calls its first and only argument,  
  like `function(emit) { emit(eventName); }`  
  and each call emits the named event on current view object, which can
  be listened using view.on(event, listener).  
  Can be used to listen recurring events, but the gtk loop needs to be
  running, see above.  

* png(writableStream or filename, [cb])  
  takes a png snapshot of the whole document right now.  
  If invoked with a filename, save the stream to file.  
  Tip: use custom css to cut portions of the document.

* html(cb)  
  get documentElement.outerHTML right now.

* pdf(filepath, [opts], [cb])  
  print page to file right now  
  orientation : "landscape" or "portrait", default "portrait"  
  fullpage : boolean, sets margins to 0, default false  
  paper : string, typical values are iso_a3, iso_a4, iso_a5, iso_b5,
    na_letter, na_executive, na_legal, see
    https://developer.gnome.org/gtk3/stable/GtkPaperSize.html

* unload(cb)  
  Sets current view to an empty document and uri.  
  Emits 'unload' event.

* destroy(cb)  
  does the reverse of init - frees webview and xvfb instance if any.  
  init() can be called again to recover a working instance.


properties
----------

* uri  
  Read-only, get current uri of the web view.

* readyState  
  Read-only: empty, "opening", "loading", "interactive", "complete"  
  Before the first call to .load(cb) it is empty, and before cb is called it
  is opening.


gtk loop and events
-------------------

webkit cannot run if its gtk event loop isn't run, and running the gtk
loop is done by calling gtk_main_iteration_do on each Node.js process
event loop. It works all right, but as long as setImmediate is called,
the current node process won't stop either.

To allow the gtk loop to stop when running it is no longer useful,
webkitgtk starts running the gtk loop when these methods are called:

* load
* run (but not runev)
* pdf
* png
* html

and it stops running the gtk loop when these conditions are met:

* when a lifecycle event happen and the next lifecycle event has no
  listener
* when all callbacks have been invoked and the next lifecycle event
  has no listener

For example, if there are no "idle" listeners after "load" is emitted,
the loop won't be kept running.

Note that calling runev() won't start the gtk loop, so one has to add a lifecycle
event listener to process and receive events sent by runev script.

To keep the gtk loop running forever, just listen to "unload" event.


about plugins
-------------

In webkit2gtk >= 2.4.4, if there are plugins in `/usr/lib/mozilla/plugins`
they are initialized (but not necessarily enabled on the WebView),
and that could impact first page load time greatly (seconds !) - especially if
there's a java plugin.

Workaround:
uninstall the plugin, on my dev machine it was
`/usr/lib/mozilla/plugins/libjavaplugin.so` installed by icedtea.


install
-------

Linux only.

These libraries and their development files must be available in usual
locations.

```
webkit2gtk-3.0 (2.4.x), for node-webkitgtk 1.2.x
webkit2gtk-4.0 (2.6.x), for node-webkitgtk >= 1.3.0
dbus-glib-1
glib-2.0
gtk+-3.0
libsoup2.4
```

Also usual development tools are needed (pkg-config, gcc, and so on).

On debian, these packages will pull necessary dependencies:

```
libwebkit2gtk-3.0-dev (2.4.x), for node-webkitgtk 1.2.x
libwebkit2gtk-4.0-dev (2.6.x), for node-webkitgtk >= 1.3.0
libdbus-glib-1-dev
```

## MacOSX install notes

You're going to need to run a VM. Install Vagrant to make your life easier.
Get vagrant installed and then:

```
~/$ vagrant box add ubuntu-server-vivid https://cloud-images.ubuntu.com/vagrant/vivid/current/vivid-server-cloudimg-amd64-vagrant-disk1.box
~/$ mkdir ubuntu-server-vivid && cd $_
~/vagrant-server-vivid/$ vagrant init ubuntu-server-vivid 
~/vagrant-server-vivid/$ vagrant up && vagrant ssh
```

Cool, once inside the VM install nvm (includes node and npm), this is very trusting of you, by the way... be warned

```
~/$ curl https://raw.githubusercontent.com/creationix/nvm/v0.16.1/install.sh | sh
~/$ source ~/.profile
~/$ nvm install 0.10.32
```

*Note* if you try to use a `0.11.*` node version you'll get compile errors.

Also install cups and xvfb

```
~/$ sudo apt-get install cups xvfb
```

You're now ready to rock.

License
-------

MIT, see LICENSE file

