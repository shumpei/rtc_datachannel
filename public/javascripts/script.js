// room url
var room_no;
(function(){
  var url = location.href;
  $("#room-url").html("<a href='"+url+"' target='_blank'>"+url+"</a>");

  var queries = location.search.slice(1).split("&");
  queries.forEach(function(query) {
    if(query.indexOf("r=") === 0) {
      room_no = query.slice(2);
    }
  });
}());


var ws = new WebSocket('ws://'+location.host+"/"+room_no);

ws.onopen = function(e) {
    console.dir(ws);
    var self = this;
    this.isActive = function(){
      return self.readyState === window.WebSocket.prototype.OPEN;
    }
};

ws.onmessage = function(e) {
  var mesg = JSON.parse(e.data);

  if(!!mesg.type && typeof(signalling[mesg.type]) === "function") {
    signalling[mesg.type](mesg);
  } else {
  }
}

function sendDescription(desc) {
  if(ws.isActive()) {
    ws.send(JSON.stringify(desc));
  }
}

var signalling = {
  'offer': onReceiveOffer,
  'answer': onReceiveAnswer,
  'candidate': onReceiveCandidate,
  'bye': onReceiveHangup
}


$("#send form#text").submit(function(e) {
    e.preventDefault();
    var mesg = $(this).find("input[type=text]").val();
    if(!!mesg === false) return;
    $(this).find("input[name=mesg]").val("");

    if(ws.isActive()) {
      dataChannel.send(mesg);
      for(var i = 0; i < 10; i+=1) {
        dataChannel.send(i);
      }
    }
});

$("#send form#file input[name=file]").change(function(e){
    var file = e.target.files[0];
    var reader = new FileReader();
    reader.onload  = function(e){
      var data = e.target.result;
      var len = data.length;
      var plen = 300;
      var buff = [];

      for( var i = 0, l = Math.ceil(len / plen); i < l; i += 1) {
        var data_ = data.slice(plen * i, plen * (i + 1));
        var obj = {"seq": i, "max": l - 1, "data": data_};
        // dataChannel.send(JSON.stringify(obj));
        buff.push(obj);
      }

      var i = 0, l = Math.ceil(len / plen);
      var timer = setInterval(function(e) {
         console.log(i);
         if(i === l) {
           clearInterval(timer);
           return;
         } else {
           dataChannel.send(JSON.stringify(buff[i]));
           i += 1;
         }
      }, 150);
    }
    reader.readAsDataURL(file);
});

$("#send form#file").submit(function(e) {
    e.preventDefault();
});

outputToReceive = function(data) {
  if(data.indexOf("data:image") === 0) {
    $("#receive").prepend("<img src='"+data+"'><hr>");
  } else {
    $("#receive").prepend(data + "<hr>");
  }
}

$("#send button").attr("disabled", "disabled");
$("#send-offer").attr("disabled", "disabled");

// WebRTC
/////////////////////////////////////////
var dataChannel;

$("#start").click(createConnection);
$("#send-offer").click(startSendOffer);

function trace(text) {
    // This function is used for logging.
    if (text[text.length - 1] == '\n') {
      text = text.substring(0, text.length - 1);
    }
    console.log((performance.now() / 1000).toFixed(3) + ": " + text);
}

function createConnection() {
  var servers = null;
  // var servers = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
  // If you use STUN, indicate stun url except for null
  window.pc = new webkitRTCPeerConnection(servers,
      {optional: [{RtpDataChannels: true}]});
  trace('Created local peer connection object pc');

  try {
    // Reliable Data Channels not yet supported in Chrome
    // Data Channel api supported from Chrome M25.
    // You need to start chrome with  --enable-data-channels flag.
    dataChannel = pc.createDataChannel("DataChannel",{reliable: false});
    //     {reliable: true});
    trace('Created send data channel');
  } catch (e) {
    alert('Failed to create data channel. ' +
        'You need Chrome M25 or later with --enable-data-channels flag');
    trace('Create Data channel failed with exception: ' + e.message);
  }
  pc.onicecandidate = iceCallback1;
  dataChannel.onopen = onDataChannelStateChange;
  dataChannel.onmessage = onDataChannelReceiveMessage;
  dataChannel.onclose = onDataChannelStateChange;

  $("#start").attr("disabled", "disabled");
  $("#send-offer").attr("disabled", false);
}

function startSendOffer(){
  pc.createOffer(function(desc){
    trace("create Offer succeed. Send it to peer.");
    pc.setLocalDescription(desc);
    sendDescription(desc);
  });
}

function onReceiveOffer(desc) {
  trace("Receive Offer from peer.");
  pc.setRemoteDescription(new RTCSessionDescription(desc));
  pc.createAnswer(function(desc_) {
    trace("Create Answer succeeded. Send it to peer.");
    pc.setLocalDescription(desc_);
    sendDescription(desc_);
  });
}

function onReceiveAnswer(desc){
  trace("Receive Answer from peer.");
  pc.setRemoteDescription(new RTCSessionDescription(desc));
}

function onReceiveCandidate(desc){
  trace("Receive Candidate from peer.");
  var candidate = new RTCIceCandidate({sdpMLineIndex:desc.label, candidate:desc.candidate});
  pc.addIceCandidate(candidate);
}

function onReceiveHangup(desc){
  trace("Receive Hangup from peer.");
  pc.close();
  pc = null;
}

function iceCallback1(event) {
  if (event.candidate) {
    trace("Found candidate. Send it to peer.");
    sendDescription({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    trace("End of candidate");
  }
}



function onDataChannelStateChange() {
  var readyState = dataChannel.readyState;
  if(readyState === "open"){
    $("#send-offer").attr("disabled", "disabled");
    $("#send button").attr("disabled", false);
  }
  trace('Send channel state is: ' + readyState);
}

var recvBuff = [];
function onDataChannelReceiveMessage(ev){
  console.log(ev);
  var data = JSON.parse(ev.data);
  recvBuff[data.seq] = data.data

  if(data.seq === data.max)
    outputToReceive(recvBuff.join(""));

//  outputToReceive(ev);
}
