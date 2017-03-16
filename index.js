const EventEmitter = require('events');
const WebSocket = require('ws');
const request = require('request');

class LCPush extends EventEmitter {
  constructor(config) {
    super();

    if (typeof config !== 'object') {
      throw new Error('LCPush need a argument at least.');
    } else if (!config.appId) {
      throw new Error('Options must have appId.');
    } else if (!config.appKey) {
      throw new Error('Options must have appKey.');
    }

    this.config = {};
    this.config.appId = config.appId;
    this.config.appKey = config.appKey;

    this.config.installation = config.installation ? config.installation : {};
    this.config.installation.installationId = config.installationId;
    if (!this.config.installation.deviceType) this.config.installation.deviceType = 'web';

    this.config.heartbeatsTime = config.heartbeatsTime ? config.heartbeatsTime : 30 * 1000;
    this.config.region = config.region ? config.region : 'cn';
    this.config.secure = config.secure ? config.secure : true; // 是否获取 wss 的安全链接

    if (!config.host) {
      switch (this.config.region) {
        case 'cn': {
          this.config.host = 'leancloud.cn';
          break;
        }
        case 'us': {
          this.config.host = 'us-api.leancloud.cn';
          break;
        }
        default: {
          throw new Error('There is no this region.');
        }
      }
    } else {
      this.config.host = config.host;
    }

    this.request = request.defaults({
      baseUrl: `https://${this.config.host}/1.1`,
      timeout: 5000,
      headers: {
        'X-AVOSCloud-Application-Id': this.config.appId,
        'X-AVOSCloud-Application-Key': this.config.appKey,
      },
    });
  }

  open(callback) {
    this.closeFlag = false;
    if (!this.server || new Date() > this.server.expires) {
      this.getServer((error, server) => {
        if (error && !callback) {
          return this.emit('error', error);
        } else if (error && callback) {
          return callback(error);
        }
        this.server = server;
        return this.open(callback);
      });
      return this;
    }
    this.connectWS(callback);
    return this;
  }

  close() {
    this.closeFlag = true;
    this.ws.close();
  }

  connectWS(callback) {
    this.ws = new WebSocket(this.server.server);

    this.ws.on('open', () => {
      this.heartbeats();
      this.loginPush((error) => {
        if (error && !callback) {
          return this.emit('error', error);
        }
        if (callback) {
          callback(error);
        }
        return null;
      });
      this.guard();
      this.emit('open');
    });

    this.ws.on('message', (body) => {
      const data = JSON.parse(body);
      if (data.cmd === 'data') {
        this.ackPush(data.ids);
        for (let i = 0; i < data.msg.length; i++) {
          this.emit('message', data.msg[i]);
        }
      }
    });

    this.ws.on('error', (error) => {
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      this.emit('close');
    });
  }

  wsSend(data, callback) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data), (error) => {
        if (error && !callback) {
          return this.emit('error', error);
        }
        if (callback) {
          callback(error);
        }
        return null;
      });
    } else if (callback) {
      callback(new Error('WebSocket is not ready.'));
    } else {
      this.emit('error', new Error('WebSocket is not ready.'));
    }
  }

  heartbeats() {
    this.wsSend({});
    this.ws.on('message', () => {
      if (this.heartbeatsTimer) {
        clearTimeout(this.heartbeatsTimer);
      }
      this.heartbeatsTimer = setTimeout(() => {
        this.wsSend({});
      }, this.config.heartbeatsTime);
    });
  }

  guard() {
    this.on('close', () => {
      if (!this.closeFlag) {
        this.emit('reuse');
      }
    });
    this.once('reuse error', () => {
      if (this.reuseTimer) {
        clearTimeout(this.reuseTimer);
      }
      this.reuseTimer = setTimeout(() => {
        this.open();
      }, 5000);
    });
  }

  loginPush(callback) {
    this.saveInstallation((error) => {
      if (error) {
        return callback(error);
      }
      this.wsSend({
        cmd: 'login',
        appId: this.config.appId,
        installationId: this.config.installation.installationId,
      }, callback);
      return this;
    });
  }

  ackPush(idList) {
    this.wsSend({
      cmd: 'ack',
      appId: this.config.appId,
      installationId: this.config.installation.installationId,
      ids: idList,
    });
  }

  saveInstallation(callback) {
    if (!this.config.installation.installationId) {
      throw new Error('Options must have installationId.');
    }

    this.request({
      url: '/installations',
      method: 'post',
      json: this.config.installation,
    }, (error, res, body) => {
      if (body.error) {
        const err = new Error(body.error);
        err.code = body.code;
        callback(err);
      } else {
        callback(error, body);
      }
    });

    return null;
  }

  sendPush(options, callback) {
    this.request({
      url: '/push',
      method: 'post',
      json: options,
    }, (error, res, body) => {
      if (body.error) {
        const err = new Error(body.error);
        err.code = body.code;
        callback(err);
      } else {
        callback(error, body);
      }
    });
  }

  subscribeChannels(channels, callback, isRemove) {
    const options = {
      installationId: this.config.installation.installationId,
      deviceType: this.config.deviceType,
    };

    if (isRemove) {
      options.channels = {
        __op: 'Remove',
        objects: channels,
      };
    } else {
      options.channels = channels;
    }
    this.request({
      url: '/installations',
      method: 'post',
      json: options,
    }, (error, res, body) => {
      if (body.error) {
        const err = new Error(body.error);
        err.code = body.code;
        callback(err);
      } else {
        callback(error, body);
      }
    });
  }

  getServer(callback) {
    const appId = this.config.appId;
    let node = '';
    switch (this.config.region) {
      case 'cn': {
        node = 'g0';
        break;
      }
      case 'us': {
        node = 'a0';
        break;
      }
      default: {
        throw new Error('There is no this region.');
      }
    }
    let url = `https://router-${node}-push.leancloud.cn/v1/route?appId=${appId}`;
    if (this.config.secure) {
      url += '&secure=1';
    }
    request(url, (error, res, body) => {
      if (error) {
        callback(error);
      } else if (body.error) {
        const err = new Error(body.error);
        err.code = body.code;
        callback(err);
      } else {
        const data = JSON.parse(body);
        data.expires = new Date() + (data.ttl * 1000);
        callback(error, data);
      }
    });
  }

  static genInstallationId(length = 32) {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
  }
}

module.exports = LCPush;
