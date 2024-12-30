'use strict';

import createWebSocket from 'ws13';
import http from 'node:http';
import fs from 'node:fs';
import { pipeline } from 'node:stream';

var server = new http.createServer(),
    wsList = [];

// upgrade event for WebSocket
server.on('upgrade', function upgrade(request) {

    // creates WebSocket
    var websocket = createWebSocket({

        // upgrade request
        request,

        // if true, the server will send debug information to the console (optional)
        isDebug: true,

        // the sub-protocol the server is ready to communicate with the client (optional)
        /*protocol = '',*/

        // the origin of the request (optional)
        origin: 'http://localhost:3000',

        // The interval after which ping pong takes place. Default `30000`. (optional)
        /*heartbeatInterval_ms = 60000,*/ // 1 minute

        // WebSocket selected extensions or `null`. Default `permessage-deflate`. `permessage-deflate` extension compresses the data sent over the WebSocket. (optional)
        /*extension: null*/
    });

    // has WebSocket, the handshake is done
    if (websocket) {

        // inserts a WebSocket from the list
        wsList.push(websocket);

        // add listeners to the WebSocket
        websocket
            // error handling
            .on('error', console.error)
            // connection established with the client (handshake done)
            .on('open', () => {

                /* now you can send and receive messages */
            })
            // message received from the client (event.isBinary is boolean) (event.data is string or buffer)
            .on('message', (event) => {

                // send to everyone
                wsList.forEach(function (socket) {

                    // send message to the client
                    socket.send(`ws-${wsList.indexOf(websocket)}: ${event.data}`);
                });
            })
            // connection closed with the client
            .on('close', function (event) {

                // removing an WebSocket from list 
                wsList = wsList.filter(ws => ws !== websocket);
            });
    }
        // handshake not accepted, close the connection with the client
    else { request.socket.end(); }

});

// HTTP server for static files
server.on('request', function (req, res) {

    // if the request is for the root, send the index.html
    if (req.url === '/') {
        
        var raw = fs.createReadStream('./index.html');
        res.writeHead(200, { 'Content-Type': 'text/html;charset=UTF-8' });
        pipeline(raw, res, function (err) { res.end(err + ''); });

        return;
    }

    // otherwise, send 404 Not Found
    res.writeHead(404);
    res.end('Not Found');
});

// error handling
server.on('error', console.error);

// start server
server.listen(3000, 'localhost', function () {
    // server started successfully
    console.log('Server running at http://localhost:3000/');
    console.log('Open the browser and go to http://localhost:3000/ to connect to the websocket server.');
});