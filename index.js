var Cable = require('cable');
var util = require('util');

var empty = new Buffer(0);

var parse = function(cb) {
	return cb && function(err, buffer) {
		if (err) return cb(err);
		cb(null, JSON.parse(buffer.toString()));
	};
};

var stringify = function(cb) {
	return function(err, obj) {
		if (err) return cb(err);
		cb(null, JSON.stringify(obj === undefined ? null : obj));
	};
};

var Protocol = function(id) {
	if (!(this instanceof Protocol)) return new Protocol(id);
	Cable.call(this);

	var self = this;

	this.id = id;

	this._amSubscribing = {};
	this._peerSubscribing = {};

	this.on('message', function(message, cb) {
		var opcode = message[0];
		var idLen = message.readUInt16LE(1);
		var id = message.toString('utf-8', 3, 3+idLen);
		var payload = message.slice(3+idLen);

		var emit = function() {
			self.emit.apply(self, arguments) || cb(new Error('Command is not supported'));
		};

		var i = id.indexOf('@');
		var origin = i > -1 ? id.slice(i+1) : 'unknown';

		if (i > -1) id = id.slice(0, i);

		switch (opcode) {
			case 0:  return emit('get', id, stringify(cb));
			case 1:  return emit('add', id, JSON.parse(payload.toString()), cb);
			case 2:  return emit('update', id, JSON.parse(payload.toString()), cb);
			case 3:  return emit('remove', id, cb);
			case 4:  return emit('list', stringify(cb));
			case 5:  return emit('ps', stringify(cb));
			case 6:  return emit('start', id, cb);
			case 7:  return emit('stop', id, cb);
			case 8:  return emit('restart', id, cb);
			case 9:  return emit('sync', id, JSON.parse(payload.toString()), cb);

			case 10:
			self._peerSubscribing[id] = true;
			return emit('subscribe', id, cb);

			case 11:
			delete self._peerSubscribing[id];
			return emit('unsubscribe', id, cb);

			case 12: return emit('stdout', id, origin, payload);
			case 13: return emit('stderr', id, origin, payload);
			case 14: return emit('spawn', id, origin, JSON.parse(payload.toString()));
			case 15: return emit('exit', id, origin, JSON.parse(payload.toString()));
		}

		cb(new Error('Command is not supported'));
	});
};

util.inherits(Protocol, Cable);

Protocol.prototype.amSubscribing = function(id) {
	return this._amSubscribing[id] || this._amSubscribing['*'];
};

Protocol.prototype.peerSubscribing = function(id) {
	return this._peerSubscribing[id] || this._peerSubscribing['*'];
};

Protocol.prototype.get = function(id, cb) {
	this._send(0, id, null, parse(cb));
};

Protocol.prototype.add = function(id, service, cb) {
	this._send(1, id, JSON.stringify(service), cb);
};

Protocol.prototype.update = function(id, service, cb) {
	this._send(2, id, JSON.stringify(service), cb);
};

Protocol.prototype.remove = function(id, cb) {
	this._send(3, id, null, cb);
};

Protocol.prototype.list = function(cb) {
	this._send(4, '', null, parse(cb));
};

Protocol.prototype.ps = function(cb) {
	this._send(5, '', null, parse(cb));
};

Protocol.prototype.start = function(id, cb) {
	this._send(6, id, null, cb);
};

Protocol.prototype.stop = function(id, cb) {
	this._send(7, id, null, cb);
};

Protocol.prototype.restart = function(id, cb) {
	this._send(8, id, null, cb);
};

Protocol.prototype.sync = function(id, service, cb) {
	this._send(9, id, JSON.stringify(service), cb);
};

Protocol.prototype.subscribe = function(id, cb) {
	if (typeof id === 'function') return this.subscribe(null, id);
	if (!id) id = '*';
	this._amSubscribing[id] = true;
	this._send(10, id, null, cb);
};

Protocol.prototype.unsubscribe = function(id, cb) {
	if (typeof id === 'function') return this.unsubscribe(null, id);
	if (!id) id = '*';
	delete this._amSubscribing[id];
	this._send(11, id, null, cb);
};

Protocol.prototype.stdout = function(id, origin, data) {
	this._send(12, id+'@'+origin, data);
};

Protocol.prototype.stderr = function(id, origin, data) {
	this._send(13, id+'@'+origin, data);
};

Protocol.prototype.spawn = function(id, origin, pid) {
	this._send(14, id+'@'+origin, JSON.stringify(pid));
};

Protocol.prototype.exit = function(id, origin, code) {
	this._send(15, id+'@'+origin, JSON.stringify(code));
};

Protocol.prototype.destroy = function() {
	this._cable.destroy();
};

Protocol.prototype._send = function(opcode, id, payload, cb) {
	if (!payload) payload = empty;
	if (!Buffer.isBuffer(payload)) payload = new Buffer(payload);

	var idLen = Buffer.byteLength(id);
	var message = new Buffer(3+idLen+payload.length);

	message[0] = opcode;
	message.writeUInt16LE(idLen, 1);
	message.write(id, 3);
	if (payload.length) payload.copy(message, 3+idLen);

	this.send(message, cb);
};

module.exports = Protocol;