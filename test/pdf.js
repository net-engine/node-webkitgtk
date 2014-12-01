var WebKit = require('../');
var expect = require('expect.js');
var fs = require('fs');

describe("pdf method", function suite() {
	it("should save a printed pdf to disk", function(done) {
		this.timeout(10000);
		var pdfpath = __dirname + '/shots/test.pdf';
		WebKit().load("https://www.debian.org/", {
			width:800, height:600,
			style: fs.readFileSync(__dirname + "/../css/png.css")
		}, function(err) {
			expect(err).to.not.be.ok();
		}).wait('load').pdf(pdfpath, {fullpage:true, paper:"iso_a4"}, function(err) {
			expect(err).to.not.be.ok();
			fs.stat(pdfpath, function(err, stat) {
				expect(stat.size).to.be.above(90000);
				done();
			});
		});
	});
});

