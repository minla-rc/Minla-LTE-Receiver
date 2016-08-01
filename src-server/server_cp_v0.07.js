
/*	
		=============================================================
		Author: Gennady Shmakov <gshmakov@gmail.com>
		Copyright (c) 2016 Minla RC. All rights reserved.
		
		This file is a part of Minla RC LTE FPV receiver project.
		=============================================================
*/


/*	
		Server uses single UDP socket for both camera and data (binary for camera and text for data)
		Works with cp_v0.07.html file
		Possible issues - all processing is done on client side -> may be slow
		
		UPDATE: this modification supposed to work with single websocket and single udp socket for multiple clients
		Uinque id of the STM32F4 device is located at 0x1FFF7A10 and is sent upon connecting both over websocket and over udp
*/


// =========== API CONST used in this server script ==================
var CONST_2I_REG="2i_reg:"; //Registration/heartbeat message received over UDP from anonymous receiver board
var CONST_2I_HB="2i_HB"; //Message sent via websocket indicating there is a heartbeat received over UDP from corresponding receiver board
var CONST_2I_PREAMBLE="2i_";
// =========== API CONST used in this server script END ==============

var ServerIP="0.0.0.0";
var WebSocketServerPort=9000; 	//WebSocket port
var UDPSocketPort=3000;					//UDP socket port

var dgram=require('dgram');
var WebSocketServer=require('ws').Server;

var clientsArray=[]; //items [0:ws, 1:uid, 2:udp_ip, 3:udp_port, 4:ws_hb, 5:udp_hb]


// =========== WebSocket section ==================
var wss=new WebSocketServer({host:ServerIP, port:WebSocketServerPort}, function() {console.log('WS listen on: '+wss.options.host+':'+wss.options.port);});

wss.on('connection', function(ws) {
	
	//check if this uid is already connected
	for (var i=0;i<clientsArray.length;i++) {
		if (clientsArray[i][1]==ws.protocol) {
			console.log('uid already connected:'+ws.protocol);
			ws.terminate();
			return;
		}
	}
	
	clientsArray.push([ws,ws.protocol,0,0,1,1]);
	console.log('+uid_ws:'+ws.protocol);
	
	ws.on('message', function(data) { //Data received on websocket
		for (var i=0;i<clientsArray.length;i++) {
			if (clientsArray[i][0]==ws) {
				clientsArray[i][4]=1; //Set heartbeat received if any message received over websocket
				if ((clientsArray[i][2]!=0)&&(clientsArray[i][3]!=0)) {
					var tempMSG=new Buffer(data);
					UDPserver.send(tempMSG,0,tempMSG.length,clientsArray[i][3],clientsArray[i][2]);
				}
				return;
			}
		}
	});
	
	ws.on('close', function() {
		for (var i=0;i<clientsArray.length;i++) {
			if (clientsArray[i][0]==ws) {
				console.log('-uid_ws:'+clientsArray[i][1]);
				clientsArray.splice(i,1);
				return;
			}
		}
	});
	
});

//timer to check for heartbeat from websockets. if no -> remove peers
setInterval(function() {
	for (var i=0;i<clientsArray.length;i++) {
		if (clientsArray[i][4]==1) {
			clientsArray[i][4]=0;
		} else {
			console.log("ws hb failed for uid:"+clientsArray[i][1]);
			clientsArray[i][0].close();
		}
	}
}, 6000); //6 seconds
// =========== WebSocket section END ==============


// =========== UDP section ==================
UDPserver=dgram.createSocket("udp4");
UDPserver.bind(UDPSocketPort, ServerIP);

UDPserver.on('listening', function() {
	var UDPaddr=UDPserver.address();
	console.log("UDP opened on "+UDPaddr.address+":"+UDPaddr.port);
});

UDPserver.on('message', function(msg, rinfo) {
	if (msg.slice(0,7)==CONST_2I_REG) { //reg packet format "2i_reg:010203040506070809101112;"
		console.log("UDP connect uid:"+new Date()+msg.slice(7,-1)); //############### used to add new users (to know their uid) ########################
		for (var i=0;i<clientsArray.length;i++) {
			if (clientsArray[i][1]==msg.slice(7,-1)) {
				if (clientsArray[i][2]==0) {console.log('+uid_UDP:'+clientsArray[i][1]);}
				clientsArray[i][2]=rinfo.address;
				clientsArray[i][3]=rinfo.port;
				if (clientsArray[i][0].readyState==clientsArray[i][0].OPEN) {clientsArray[i][0].send(CONST_2I_HB,{binary:false});}
				clientsArray[i][5]=1;
				return;
			}
		}
	} else { //if not a reg packet
		for (var i=0;i<clientsArray.length;i++) {
			if ((clientsArray[i][2]==rinfo.address)&&(clientsArray[i][3]==rinfo.port)) {
				if (msg.slice(0,3)==CONST_2I_PREAMBLE) {
					if (clientsArray[i][0].readyState==clientsArray[i][0].OPEN) {clientsArray[i][0].send(msg,{binary:false});}
				} else {
					if (clientsArray[i][0].readyState==clientsArray[i][0].OPEN) {clientsArray[i][0].send(msg,{binary:true});}
				}
				return;
			}
		}
	}
});

//timer to check for heartbeat from UDP. if no -> remove peers
setInterval(function() {
	for (var i=0;i<clientsArray.length;i++) {
		if (clientsArray[i][2]!=0) {
			if (clientsArray[i][5]==1) {
				clientsArray[i][5]=0;
			} else {
				console.log("UDP hb failed for uid:"+clientsArray[i][1]);
				clientsArray[i][2]=0;
				clientsArray[i][3]=0;
			}
		}
	}
}, 6000); //6 seconds

// =========== UDP section END ==============








