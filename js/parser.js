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

function bucketsBySplittingArray(array, maxItemsPerBucket) {
  var buckets = [];
  while (buckets.length * maxItemsPerBucket < array.length) {
    buckets.push(array.slice(buckets.length * maxItemsPerBucket,
                             (buckets.length + 1) * maxItemsPerBucket));
  }
  return buckets;
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
  send: function WorkerRequest_send(task, taskData) {
    var startTime = Date.now();
    this._worker.postMessage({
      requestID: this._requestID,
      task: task,
      taskData: taskData
    });
    var postTime = Date.now() - startTime;
    if (postTime > 10)
      console.log("posting message to worker: " + postTime + "ms");
  },
  sendInChunks: function WorkerRequest_sendInChunks(task, taskData, maxChunkSize) {
    var self = this;
    var chunks = bucketsBySplittingArray(taskData, maxChunkSize);
    var pendingMessages = [
      {
        requestID: this._requestID,
        task: "chunkedStart"
      }
    ].concat(chunks.map(function (chunk) {
      return {
        requestID: self._requestID,
        task: "chunkedChunk",
        chunk: chunk
      };
    })).concat([
      {
        requestID: this._requestID,
        task: "chunkedEnd"
      },
      {
        requestID: this._requestID,
        task: task
      },
    ]);
    function postMessage(msg) {
      var startTime = Date.now();
      self._worker.postMessage(msg);
      var postTime = Date.now() - startTime;
      if (postTime > 10)
        console.log("posting message to worker: " + postTime + "ms");
    }
    var messagePostingTimer = 0;
    function postMessages() {
      messagePostingTimer = 0;
      postMessage(pendingMessages.shift());
      if (pendingMessages.length)
        scheduleMessagePosting();
    }
    function scheduleMessagePosting() {
      if (messagePostingTimer)
        return;
      messagePostingTimer = setTimeout(postMessages, 0);
    }
    scheduleMessagePosting();
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
    console.log("profile num chars: " + data.length);
    var request = new WorkerRequest(gParserWorker);
    request.sendInChunks("parseRawProfile", data, 3000000);
    return request;
  },

  updateFilters: function Parser_updateFilters(filters) {
    var request = new WorkerRequest(gParserWorker);
    request.send("updateFilters", {
      filters: filters,
      profileID: 0
    });
    return request;
  },

  updateViewOptions: function Parser_updateViewOptions(options) {
    var request = new WorkerRequest(gParserWorker);
    request.send("updateViewOptions", {
      options: options,
      profileID: 0
    });
    return request;
  },
};
