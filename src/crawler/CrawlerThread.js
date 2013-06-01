'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var smpl = require('smpl');

var Crawler = require('./Crawler');
var urlStore = require('../url/urlStore');

var CrawlerThread = function(config) {
	this.id = smpl.utils.uniq();
	this.crashRecover = config.crashRecover;
	
	console.log('[' + this.id + '] Starting ' + (this.crashRecover ? 'crashRecover' : 'Crawler') + ' Thread');
	this.nbCrawlers = 0;
	this.maxCrawlers = config.nbCrawlers || 1;
	this.userAgent = config.userAgent;
	
	this.startCrawling = this.startCrawling.bind(this);
	
	require('node-phantom').create(this.phantomStarted.bind(this), {phantomPath: require('phantomjs').path});
};
util.inherits(CrawlerThread, EventEmitter);

CrawlerThread.prototype.phantomStarted = function(err, phantom) {
	if (err) throw err;
	
	this.onPhantomExit = this.phantomExit.bind(this);
	phantom.on('exit', this.onPhantomExit);

	this.phantom = phantom;
	if (this.doExit) {
		this.exit();
	} else {
		this.requestUrl();
	}
};

CrawlerThread.prototype.requestUrl = function() {
	if (!this.urlRequestRunning && !this.exited) {
		urlStore[this.crashRecover ? 'getCrashedPage' : 'getPage'](this.startCrawling);
		this.urlRequestRunning = true;
	}
};

CrawlerThread.prototype.startCrawling = function(url) {
	this.urlRequestRunning = false;
	
	this.nbCrawlers++;
	var crawler = new Crawler(this.phantom, {
		url: url,
		onComplete: this.crawlDone.bind(this),
		userAgent: this.userAgent,
		parentId: this.id,
		thread: this
	});

	if (this.nbCrawlers < this.maxCrawlers) {
		this.requestUrl();
	}
};

CrawlerThread.prototype.crawlDone = function() {
	this.nbCrawlers--;
	if (this.nbCrawlers === 0) this.emit('idle');
	this.requestUrl();
};

CrawlerThread.prototype.isIdle = function() {
	return (this.nbCrawlers === 0);
};

CrawlerThread.prototype.exit = function() {
	console.log('[' + this.id + '] Exiting ' + (this.crashRecover ? 'crashRecover' : 'Crawler') + ' Thread');
	this.exited = true;
	if (!this.phantom) {
		// We might exit before phantom had time to start (eg. crawling only one image)
		this.doExit = true;
	} else {
		this.phantom.removeListener('exit', this.onPhantomExit);
		this.phantom.exit();
	}
};

CrawlerThread.prototype.phantomExit = function() {
	console.log('[' + this.id + '] Phantom crashed !');
	if (this.urlRequestRunning) {
		urlStore.cancelGetPage(this.startCrawling);
		this.urlRequestRunning = false;
	}
	this.exit();
	this.emit('crash');
};

module.exports = CrawlerThread;
