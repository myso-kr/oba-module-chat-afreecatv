import _ from 'lodash';
import Promise from 'bluebird';
import Logger from 'debug';
import EventEmitter from 'events'
import URL from 'url';
import fetch from 'node-fetch';
import FormData from 'form-data';
import WebSocket from 'ws';

const URL_ORIGIN = 'http://m.afreecatv.com';
const URL_BROADCAST_META = "http://api.m.afreecatv.com/broad/a/watch";
const URL_BROADCAST_SOCK = "http://api.m.afreecatv.com/broad/chat/bridge/a/getList";

export default class Module extends EventEmitter {
	constructor(oba, options, url) {
		super();
		this.name = "oba:chat:afreecatv";
		this.oba = oba || new EventEmitter();
		this.stdout = Logger(`${this.name}`);
		this.stderr = Logger(`${this.name}:error`);

		const uri = URL.parse(url, true, true);
        const segments = _.split(uri.pathname, '/');
        this.defaults = {
        	name: this.name,
        	source: url, 
        	caster: {
        		username: _.get(segments, 1),
        		identify: _.get(segments, 2)
        	}
        };
        this.options = _.merge({}, this.defaults, options);
        this.socket = new Socket(this);
	}

	connect() { this.socket.connect(); }

	disconnect() { this.socket.disconnect(); }

	async meta() {
		const form = new FormData();
        form.append('bj_id', this.options.caster.username);
        form.append('broad_no', this.options.caster.identify);
        form.append('language', 'ko');
        form.append('agent', 'web');
        const resp = await fetch(URL_BROADCAST_META, { method: 'POST', body: form }).then((resp) => resp.json());
        return _.get(resp, 'data');
	}
	async sock() {
		const resp = await fetch(URL_BROADCAST_SOCK).then((resp)=>resp.json());
        return _.sample(_.get(resp, 'data.list'));
	}
}

class Socket extends EventEmitter {
	constructor(module) {
		super();
		this.module = module;
		this.events = [];
		this.addEventPacketName("login", /^LOGIN\|/);
        this.addEventPacketName("join", /^JOIN\|/);
        this.addEventPacketName("message", /^CHATMESG\|/);
	}
	addEventPacketName(eventName, matchPattern, callback) {
        this.events.push({ eventName, matchPattern });
	}
	getEventPacketName(packetData) {
		return _.get(_.find(this.events, (event) => event.matchPattern.test(packetData)), 'eventName');
	}

	connect() {
		if(this.native) return;
		this.native = true;
		Promise.resolve().then(async () => {
			const meta = await this.module.meta();
            const sock = await this.module.sock();

            const socket = this.native = new WebSocket(`ws://${sock}/Websocket`, 'chat', { origin: URL_ORIGIN });
            socket.on('open', () => this.emit('connect'));
            socket.on('error', (e) => this.emit('error', e));
            socket.on('close', () => {
            	this.native = null;
            	this.emit('close');
            });
            socket.on('message', (data) => {
            	const eventName = this.getEventPacketName(data);
            	if (eventName) { this.emit(eventName, _.split(data, '|')) }
            });
            this.on('connect', () => this.native.send(`LOGIN${meta.channel_info}::0::mweb_aos`));
	        this.on('login', () => this.native.send(`JOIN${meta.chat_no}:${meta.fan_ticket}`));
	        this.on('join', () => this.native.send(`CONNECTCENTER${meta.relay_ip}:${meta.relay_port}:${meta.broad_no}`));
	        this.on('message', (segments) => {
	        	this.module.emit('message', {
                    module: this.module.defaults,
                    username: _.get(segments, 2),
                    nickname: _.get(segments, 4),
                    message: _.get(segments, 1),
                    timestamp: Date.now()
                });
	        });
		});
	}
	disconnect() {
		if(!this.native) return;
		this.native.close();
	}
}