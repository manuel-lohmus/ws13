
<div class="row w-100">
<div class="col-3 d-none d-lg-inline">
<div class="sticky-top overflow-auto vh-100">
<div id="list-headers" class="list-group mt-5">

- [**WebSocket API**](#websocket-api-version-13)
  - [Description](#description)
  - [Features](#features)
  - [Installation](#installation)
  - [Testing](#testing)
  - [License](#license)
  - [Usage](#usage)
- [**WebSocket** - interface](#websocket)
  - [Constructors](#constructors-of-websocket)
  - [Static properties](#static-properties-of-websocket)
  - [Instance properties](#instance-properties-of-websocket)
  - [Instance methods](#instance-methods-of-websocket)
  - [Events](#events-of-websocket)
- [**Ready state constants**](#ready-state-constants)
- [**Extension** - interface](#extension)
  - [Constructors](#constructors-of-extension)
  - [Instance methods](#instance-methods-of-extension)
- [**Frame** - interface](#frame)
  - [Instance properties](#instance-properties-of-frame)


 
</div>
</div>
</div>
 
<div class="col">
<div class="p-2 markdown-body" data-bs-spy="scroll" data-bs-target="#list-headers" data-bs-offset="0" tabindex="0">

# WebSocket API [version 13] 

This manual is also available in [HTML5](https://manuel-lohmus.github.io/ws13/README.html). 
<br>
This document was created with the help of Copilot

## Description

The WebSocket API is an advanced technology that makes it 
possible to open a two-way interactive communication session 
between the user's browser and a server. With this API, 
you can send messages to a server and receive event-driven 
responses without having to poll the server for a reply.

Common use cases for the WebSocket API include:

1.	**Real-time updates:** Applications that require real-time data updates, such as live sports scores, stock market updates, or live news feeds.

2.	**Chat applications:** Instant messaging and chat applications where low latency and real-time communication are crucial.

3.	**Online gaming:** Multiplayer online games that need real-time interaction between players.

4.	**Collaborative tools:** Applications like collaborative document editing, where multiple users need to see changes in real-time.

5.	**IoT (Internet of Things):** Communication between IoT devices and servers for real-time data exchange and control.

6.	**Live streaming:** Streaming live audio, video, or other media content to clients.

7.	**Notifications:** Sending real-time notifications to users, such as alerts or updates in web applications.
These use cases benefit from WebSocket's ability to maintain a persistent connection, allowing for efficient and low-latency communication between the client and server.

The WebSocket API is defined by the [WebSocket](https://html.spec.whatwg.org/multipage/web-sockets.html#the-websocket-interface) interface, which is part of the [HTML Living Standard](https://html.spec.whatwg.org/multipage/). The API provides a set of methods, properties, and events that enable developers to create WebSocket connections and interact with them in a web application.

## Features

The WebSocket API offers several key features that make it a powerful tool for building real-time web applications:

1. **Full-duplex communication**: WebSockets enable full-duplex communication between the client and server, allowing both parties to send and receive messages simultaneously. This bidirectional communication is essential for real-time applications that require low latency and high interactivity.

2. **Persistent connection**: Unlike traditional HTTP connections, which are stateless and short-lived, WebSocket connections are persistent and long-lived. Once established, a WebSocket connection remains open until either the client or server decides to close it. This persistent connection eliminates the need to establish a new connection for each message, reducing latency and overhead.

3. **Low latency**: WebSockets provide low-latency communication by eliminating the need for repeated handshakes and headers in each message exchange. This efficiency allows real-time data to be transmitted quickly and responsively, making WebSockets ideal for applications that require instant updates and notifications.

4. **Efficient data transfer**: WebSockets use a binary messaging format that is more compact and efficient than text-based formats like JSON or XML. This binary format reduces the size of messages sent over the network, improving performance and reducing bandwidth consumption.

5. **Cross-origin communication**: WebSockets support cross-origin communication, allowing clients to establish connections with servers hosted on different domains. This feature enables developers to build distributed systems and integrate services from multiple sources in a secure and controlled manner.

6. **Secure communication**: WebSockets can be used over secure connections (wss://) to encrypt data transmitted between the client and server. This encryption ensures that sensitive information is protected from eavesdropping and tampering, making WebSockets a secure choice for transmitting confidential data.

7. **Event-driven architecture**: The WebSocket API is event-driven, meaning that clients and servers can respond to specific events, such as message reception, connection establishment, or connection closure. This event-driven architecture simplifies the development of real-time applications by providing a clear and structured way to handle asynchronous communication.
 

## Installation

You can install `ws13` using this command:

`npm install ws13`

## Testing

You can test `ws13` on your system using this command:

`node ./node_modules/ws13/index.test`

or in the `ws13` project directory:

`npm test`

## License

This project is licensed under the MIT License.

[![Donate](https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif)](https://www.paypal.com/donate?hosted_button_id=4DAKNYHBD9MNC)

## Usage

**Example of use on a server**

```js
const { createServer } = require('node:http');
const WebSocket = require('ws13');

const server = createServer();
let wsList = [];

server.on('upgrade', function (request) {
    // upgrade WebSocket
    const websocket = new WebSocket({
        // isDebug: true,
        request,
        // protocol: '',
        // origin: 'http://localhost',
        // heartbeatInterval_ms: 30000, /* in milliseconds */
        // extension: null, /* Default `permessage-deflate`. */
    });

    // has WebSocket, the handshake is done
    if (websocket) {
        // inserts a WebSocket from the list
        wsList.push(websocket);

        // add listeners
        websocket
            .on('error', console.error)
            .on('open', function () {
                /* now you can send and receive messages */
            })
            .on('message', function (event) {
                // send to everyone
                wsList.forEach((ws) => { ws.send(event.data); });
            })
            .on('close', function () {
                // removing a WebSocket from the list
                wsList = wsList.filter(ws => ws !== websocket);
            });
    } else {
        // handshake not accepted
        request.destroy();
    }
});

```

**Example of use as a client**

In the client role, a browser-compatible implementation of 
[WebSocket](https://nodejs.org/docs/latest/api/http.html#websocket) 
should be preferred, which should provide better results.

If it is important that the same code runs on the client and server side, 
then do the following.

```js
const http = require('node:http');
const WebSocket = require('ws13');

const ws = new WebSocket({
    // isDebug: true,
    request: http.request({ hostname: '127.0.0.1', port: 80, path: '/test' }),
    // protocol: '',
    // origin: 'http://127.0.0.1',
    // extension: null, /* Default `permessage-deflate`. */
})
    .on('error', console.error)
    .on('open', function () {
        /* now you can send and receive messages */
        ws.heartbeat(function (latency_ms) { console.log('client latency_ms', latency_ms); });
        ws.send('Hello, World!');
    })
    .on('message', function (event) { console.log('client data', event.data); })
    .on('ping', function (event) { console.log('client ping', event); })
    .on('pong', function (event) { console.log('client pong', event); })
    .on('close', function () { console.log('client websocket is closed'); });
```

**Example of use as a client in the browser**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebSocket</title>
</head>
<body>
    <script>
        const ws = new WebSocket('ws://localhost:3000/test');
        ws.onopen = function () {
            ws.send('Hello, World!');
        };
        ws.onmessage = function (event) {
            console.log('server data', event.data);
        };
        ws.onclose = function () {
            console.log('client websocket is closed');
        };
    </script>
</body>
</html>
```

**Secure communication**

To use secure communication, you need to use the `https` module and the `wss` protocol.

**Example of use on a server**
```js
const { createServer } = require('node:https');
const WebSocket = require('ws13');

const server = createServer({
    key: fs.readFileSync('server-key.pem'),
    cert: fs.readFileSync('server-cert.pem')
});

let wsList = [];

server.on('upgrade', function (request) {
    // upgrade WebSocket
    const websocket = new WebSocket({
        // isDebug: true,
        request,
        // protocol: '',
        // origin: 'https://localhost',
        // heartbeatInterval_ms: 30000, /* in milliseconds */
        // extension: null, /* Default `permessage-deflate`. */
    });
    // has WebSocket, the handshake is done
    if (websocket) {
        // inserts a WebSocket from the list
        wsList.push(websocket);
        // add listeners
        websocket
            .on('error', console.error)
            .on('open', function () {
                /* now you can send and receive messages */
            })
            .on('message', function (event) {
                // send to everyone
                wsList.forEach((ws) => { ws.send(event.data); });
            })
            .on('close', function () {
                // removing a WebSocket from the list
                wsList = wsList.filter(ws => ws !== websocket);
            });
    } else {
        // handshake not accepted
        request.destroy();
    }
});
```

## WebSocket

The `WebSocket` interface is the main interface for the WebSocket API.

It extends the [`EventEmitter`](https://nodejs.org/docs/latest/api/events.html).

### Constructors of WebSocket

**constructor:** `WebSocket(options)` Returns a newly created WebSocket object.

constructor parameters:
- **parameter:** `options` Type `object`. 
  - `isDebug` Value type `boolean`. If set to `true`, more info in console. Default `false`.
  - `request` Value type `http.IncomingMessage` or `http.ClientRequest`. Reference (role of server [http.IncomingMessage](https://nodejs.org/docs/latest/api/http.html#class-httpincomingmessage)) or (role of client [http.ClientRequest](https://nodejs.org/docs/latest/api/http.html#class-httpclientrequest))
  - `headers` Value type `object`. Key-value pairs of header names and values. Header names are lower-cased. Default `request.headers`.
  - `socket` Value type `net.Socket`. This class is an abstraction of a TCP socket or a streaming IPC endpoint. Default `request.socket`.
  - `protocol` Value type `string`. The [sub-protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#subprotocols) selected by the server. Default empty string.
  - `origin` Value type `string`. String or validation function `(origin:string)=>boolean`. Default empty string.
  - `heartbeatInterval_ms` Value type `number`. The interval after which ping pong takes place. Default `30000`.
  - `extension` Value type `Extension | null`. WebSocket selected extensions or `null`. Default `permessage-deflate`. 
        
> **[permessage-deflate](./permessage-deflate.js)** is a WebSocket extension that allows messages to be compressed before being sent over the network. 
> This can significantly reduce the amount of data transmitted, especially for large messages or messages with repetitive content, improving performance and reducing bandwidth usage. 
> 
> **Benefits of permessage-deflate:**
> 1.	**Reduced Bandwidth Usage:** Compressing messages can lower the amount of data sent over the network, which is particularly beneficial for applications with limited bandwidth.
> 2.	**Improved Performance:** Smaller message sizes can lead to faster transmission times, enhancing the overall performance of real-time applications.
> 3.	**Cost Savings:** Lower bandwidth usage can result in cost savings, especially for applications that handle a large volume of data.

### Static properties of WebSocket

- **property:** `WebSocket.CONNECTING` Value `0`. The connection is not yet open.
- **property:** `WebSocket.OPEN` Value `1`. The connection is open and ready to communicate.
- **property:** `WebSocket.CLOSING` Value `2`. The connection is in the process of closing.
- **property:** `WebSocket.CLOSED` Value `3`. The connection is closed.

### Instance properties of WebSocket

- **property:** `ws.readyState` Value `0 | 1 | 2 | 3`. 
    The connection [state](#ready-state-constants).
- **property:** `ws.protocol` Value type `string`. 
    Returns the name of the [sub-protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#subprotocols) 
    the server selected; this will be one of the strings specified in the protocols 
    parameter when creating the WebSocket object, or the empty string if no connection is established.
- **property:** `ws.path` Value type `string`. 
- **property:** `ws.origin` Value type `string`. 
- **property:** `ws.heartbeatInterval_ms` Value type `number`. 
- **property:** `ws.ip` Value type `string`. IP address
- **property:** `ws.port` Value type `number`. Port number
- **property:** `ws.latency_ms` Value type `number`. 
    Latency describes the amount of delay on a network or Internet connection. 
    Low latency implies that there are no or almost no delays. 
    High latency implies that there are many delays. 
    One of the main aims of improving performance is to reduce latency.

### Instance methods of WebSocket

- **method:** `ws.close()` Returns `undefined`. Closes the connection.
- **method:** `ws.heartbeat(callback:(latency_ms:number)=>void)` Returns `undefined`.
    Initiates a ping-pong procedure by measuring its time.
- **method:** `ws.send(data)` Returns `undefined`. 
    Send `data` through the connection. 
    This method throws an error if the ready state is `CONNECTING`.
- **method:** `ws.sendPing(data)` Returns `undefined`. 
    Send `ping` through the connection. 
    This method throws an error if the ready state is `CONNECTING`.
- **method:** `ws.sendPong(data)` Returns `undefined`. 
    Send `pong` through the connection. 
    This method throws an error if the ready state is `CONNECTING`.

### Events of WebSocket

- **event:** `'close'` Fired when a connection with a `WebSocket` is closed. 
    Also available via the `onclose` property

    Event type `object`.

    Event properties:
    - `code` Returns an unsigned short containing 
        the close [code](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code) 
        sent by the server.
    - `reason` Returns a string indicating the reason the server closed the connection. 
        This is specific to the particular server and sub-protocol.
    - `wasClean` Returns a boolean value that Indicates whether or not the connection was cleanly closed.

- **event:** `'error'` Fired when a connection with a `WebSocket` has been closed because of an error, 
    such as when some data couldn't be sent. 
    Also available via the `ws.onerror` property.

    Event type `Error`.
    
- **event:** `'message'` Fired when data is received through a `WebSocket`. 
    Also available via the `onmessage` property.
    
    Event type `object`.
    
    Event properties:
    - `data` The data sent by the message emitter.
    - `isBinary` Specifies whether the message is binary or not.
    
- **event:** `'open'` Fired when a connection with a `WebSocket` is opened. 
    Also available via the `onopen` property.

    Event type `undefined`.
    
- **event:** `'ping'` Fired when ping is received through a `WebSocket`. 
    Also available via the `onping` property.
    
    Event type `object`.
    
    Event properties:
    - `data` The data sent by the message emitter.
    
- **event:** `'pong'` Fired when pong is received through a `WebSocket`. 
    Also available via the `onpong` property.

    Event type `object`.
    
    Event properties:
    - `data` The data sent by the message emitter.
    - `latency_ms` Latency describes the amount of delay on a network or Internet connection. 

## Ready state constants

| Constant   | Value | Description                                      |
| ---------- | ----- | ------------------------------------------------ |
| CONNECTING | 0     | The connection is not yet open.                  |
| OPEN       | 1     | The connection is open and ready to communicate. |
| CLOSING    | 2     | The connection is in the process of closing.     |
| CLOSED     | 3     | The connection is closed.                        |

## Extension

Extending the interface for `permessage-deflate` and `permessage-masking`

### Constructors of Extension

**constructor:** `Extension([options])` Returns a newly created Extension object.

### Instance methods of Extension

- **method:** `ext.init(ws)` Returns `undefined`. 
    Initialisation.

    method parameters:
    - **parameter:** `ws` Type [`WebSocket`](#websocket). 


- **method:** `ext.close(callback)` Returns `undefined`. Close extension.

    method parameters:
    - **parameter:** `callback` Type `(error)=>void`.


- **method:** `ext.mask(frame, callback)` Returns `undefined`. Mask frame.

    method parameters:
    - **parameter:** `frame` Type [`Frame`](#frame).
    - **parameter:** `callback` Type `(error, `[`Frame`](#frame)`)=>void`. Returns `undefined`.
      

- **method:** `ext.unmask(frame, callback)` Returns `undefined`. Unmask frame.

    method parameters:
    - **parameter:** `frame` Type [`Frame`](#frame).
    - **parameter:** `callback` Type `(error, `[`Frame`](#frame)`)=>void`. Returns `undefined`.

- **method:** `ext.generateOffer(callback)` Returns `undefined`. Client generate offer.

    method parameters:
    - **parameter:** `callback` Type `(error, extHeaderValue:string)=>void`. Returns `undefined`.
 
- **method:** `ext.activate(headers, callback)` Returns `undefined`. Client activate.

    method parameters:
    - **parameter:** `headers` Type `[string]`.
    - **parameter:** `callback` Type `(error, isActivate:boolean)=>void`. Returns `undefined`.

- **method:** `ext.generateResponse(headers, callback)` Returns `undefined`. Server generate response.

    method parameters:
    - **parameter:** `headers` Type `[string]`.
    - **parameter:** `callback` Type `(error, extHeaderValue:string)=>void`. Returns `undefined`.

- **method:** `ext.processIncomingMessage(frame, callback)` Returns `undefined`.

    method parameters:
    - **parameter:** `frame` Type [`Frame`](#frame).
    - **parameter:** `callback` Type `(error, `[`Frame`](#frame)`)=>void`. Returns `undefined`.

- **method:** `ext.processOutgoingMessage(frame, callback)` Returns `undefined`.

    method parameters:
    - **parameter:** `frame` Type [`Frame`](#frame).
    - **parameter:** `callback` Type `(error, `[`Frame`](#frame)`)=>void`. Returns `undefined`.

- **method:** `ext.processIncomingFrame(frame, callback)` Returns `undefined`.

    method parameters:
    - **parameter:** `frame` Type [`Frame`](#frame).
    - **parameter:** `callback` Type `(error, `[`Frame`](#frame)`)=>void`. Returns `undefined`.

- **method:** `ext.processOutgoingFrame(frame, callback)` Returns `undefined`.

    method parameters:
    - **parameter:** `frame` Type [`Frame`](#frame).
    - **parameter:** `callback` Type `(error, `[`Frame`](#frame)`)=>void`. Returns `undefined`.

## Frame

The `Frame` interface represents a WebSocket frame.

Frame type `object`.

### Instance properties of Frame

- **property:** `frame.isFin` Value type `boolean`. 
- **property:** `frame.isRsv1` Value type `boolean`. 
- **property:** `frame.isRsv2` Value type `boolean`. 
- **property:** `frame.isRsv3` Value type `boolean`.  
- **property:** `frame.opcode` Value type `boolean`.
- **property:** `frame.isMasked` Value type `boolean`.
- **property:** `frame.payloadLength` Value type `number`.
- **property:** `frame.maskingKey` Value type `[]`.
- **property:** `frame.payload` Value type `Buffer`.


</div>
</div>
</div>