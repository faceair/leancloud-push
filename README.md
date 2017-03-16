# LeanCloud Push (Node.js SDK)

支持服务端模拟客户端接收推送消息。

## 例子

```
const LCPush = require('leancloud-push');

const appId = 'appId';
const appKey = 'appKey';
const installationId = LCPush.genInstallationId();

// 初始化 client 实例，如果只是拿来发推送 installationId 非必须参数
const push = new LCPush({ appId, appKey, installationId });

// 如果想接收推送，需要调用 open 方法，开启和服务器的连接，上步中 installationId 是必须参数
push.open((error) => {
  if (error) {
    console.log(`连接错误，${error}`);
  } else {
    console.log('连接服务器成功，可以接收推送');
  }
});

// 发送推送
push.sendPush({
  data: {
    alert: '跨越长城，走向世界。',
  },
}, (error, body) => {
  if (error) {
    console.log(`错误：${error.stack}`);
  } else {
    console.log(body);
  }
});

// 接收到推送消息
push.on('message', (data) => {
  console.log(`消息：${JSON.stringify(data)}`);
});

// 监听网络异常，SDK 会在底层自动重新连接服务器
push.on('reuse', () => {
  console.log('异常：网络中断正在重试。。。');
});

// 捕捉错误
push.on('error', (error) => {
  console.log(`错误：${error.stack}`);
});


```

# License

MIT
