Array.prototype.clone = function() { return this.slice(0); }

function makeSample(frames, extraInfo, lines) {
  return {
    frames: frames,
    extraInfo: extraInfo,
    lines: lines
  };
}

function cloneSample(sample) {
  return makeSample(sample.frames.clone(), sample.extraInfo, sample.lines.clone());
}

var gParserWorker = new Worker("js/parserWorker.js");
gParserWorker.nextRequestID = 0;

function WorkerRequest(worker) {
  this._eventListeners = {};
  var requestID = worker.nextRequestID++;
  this._requestID = requestID;
  this._worker = worker;
  var partialResult = null;
  var self = this;
  function onMessageFromWorker(msg) {
    pendingMessages.push(msg);
    scheduleMessageProcessing();
  }
  function processMessage(msg) {
    var startTime = Date.now();
    var data = msg.data;
    var readTime = Date.now() - startTime;
    if (readTime > 10)
      console.log("reading data from worker message: " + readTime + "ms");
    if (data.requestID == requestID) {
      switch(data.type) {
        case "error":
          console.log("Error in worker: " + data.error);
          self._fireEvent("error", data.error);
          break;
        case "progress":
          self._fireEvent("progress", data.progress);
          break;
        case "finished":
          self._fireEvent("finished", data.result);
          worker.removeEventListener("message", onMessageFromWorker);
          break;
        case "finishedStart":
          partialResult = null;
          break;
        case "finishedChunk":
          partialResult = partialResult ? partialResult.concat(data.chunk) : data.chunk;
          break;
        case "finishedEnd":
          self._fireEvent("finished", partialResult);
          worker.removeEventListener("message", onMessageFromWorker);
          break;
      }
    }
  }
  var pendingMessages = [];
  var messageProcessingTimer = 0;
  function processMessages() {
    messageProcessingTimer = 0;
    processMessage(pendingMessages.shift());
    if (pendingMessages.length)
      scheduleMessageProcessing();
  }
  function scheduleMessageProcessing() {
    if (messageProcessingTimer)
      return;
    messageProcessingTimer = setTimeout(processMessages, 0);
  }
  worker.addEventListener("message", onMessageFromWorker);
}

WorkerRequest.prototype = {
  send: function WorkerRequest_send(startMessage) {
    startMessage.requestID = this._requestID;
    var startTime = Date.now();
    this._worker.postMessage(startMessage);
    var postTime = Date.now() - startTime;
    if (postTime > 10)
      console.log("posting message to worker: " + postTime + "ms");
  },

  // TODO: share code with TreeView
  addEventListener: function WorkerRequest_addEventListener(eventName, callbackFunction) {
    if (!(eventName in this._eventListeners))
      this._eventListeners[eventName] = [];
    if (this._eventListeners[eventName].indexOf(callbackFunction) != -1)
      return;
    this._eventListeners[eventName].push(callbackFunction);
  },
  removeEventListener: function WorkerRequest_removeEventListener(eventName, callbackFunction) {
    if (!(eventName in this._eventListeners))
      return;
    var index = this._eventListeners[eventName].indexOf(callbackFunction);
    if (index == -1)
      return;
    this._eventListeners[eventName].splice(index, 1);
  },
  _fireEvent: function WorkerRequest__fireEvent(eventName, eventObject) {
    if (!(eventName in this._eventListeners))
      return;
    this._eventListeners[eventName].forEach(function (callbackFunction) {
      callbackFunction(eventObject);
    });
  },
}

var Parser = {
  parse: function Parser_parse(data) {
    var request = new WorkerRequest(gParserWorker);
    request.send({
      task: "parseRawProfile",
      rawProfile: data,
      profileID: 0
    });
    return request;
  },

  updateFilters: function Parser_updateFilters(filters) {
    var request = new WorkerRequest(gParserWorker);
    request.send({
      task: "updateFilters",
      filters: filters,
      profileID: 0
    });
    return request;
  },

  updateViewOptions: function Parser_updateViewOptions(options) {
    var request = new WorkerRequest(gParserWorker);
    request.send({
      task: "updateViewOptions",
      options: options,
      profileID: 0
    });
    return request;
  },
};
