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
  var self = this;
  worker.addEventListener("message", function onMessageFromWorker(msg) {
    if (msg.data.requestID == requestID) {
      switch(msg.data.type) {
        case "error":
          self._fireEvent("error", msg.data.error);
          break;
        case "progress":
          self._fireEvent("progress", msg.data.progress);
          break;
        case "finished":
          self._fireEvent("finished", msg.data.result);
          worker.removeEventListener("message", onMessageFromWorker);
          break;
      }
    }
  });
}

WorkerRequest.prototype = {
  send: function WorkerRequest_send(startMessage) {
    startMessage.requestID = this._requestID;
    this._worker.postMessage(startMessage);
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
  parse: function Parser_parse(data, finishCallback) {
    var request = new WorkerRequest(gParserWorker);
    request.send({
      task: "parseRawProfile",
      rawProfile: data
    });
    request.addEventListener("finished", finishCallback);
  },

  filterByJank: function Parser_filterByJank(profile, filterThreshold) {
    var samples = profile.samples.clone();
    calltrace_it: for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      if (!sample)
        continue;
      if (!("responsiveness" in sample.extraInfo) ||
          sample.extraInfo["responsiveness"] < filterThreshold) {
        samples[i] = null;
      }
    }
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterBySymbol: function Parser_filterBySymbol(profile, symbolOrFunctionIndex) {
    console.log("filtering profile by symbol " + symbolOrFunctionIndex);
    var samples = profile.samples.map(function filterSample(origSample) {
      if (!origSample)
        return null;
      var sample = cloneSample(origSample);
      for (var i = 0; i < sample.frames.length; i++) {
        if (symbolOrFunctionIndex == sample.frames[i]) {
          sample.frames = sample.frames.slice(i);
          return sample;
        }
      }
      return null; // no frame matched; filter out complete sample
    });
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterByCallstackPrefix: function Parser_filterByCallstackPrefix(profile, callstack) {
    var samples = profile.samples.map(function filterSample(origSample, i) {
      if (!origSample)
        return null;
      if (origSample.frames.length < callstack.length)
        return null;
      var sample = cloneSample(origSample);
      for (var i = 0; i < callstack.length; i++) {
        if (sample.frames[i] != callstack[i])
          return null;
      }
      sample.frames = sample.frames.slice(callstack.length - 1);
      return sample;
    });
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterByCallstackPostfix: function Parser_filterByCallstackPostfix(profile, callstack) {
    var samples = profile.samples.map(function filterSample(origSample, i) {
      if (!origSample)
        return null;
      if (origSample.frames.length < callstack.length)
        return null;
      var sample = cloneSample(origSample);
      for (var i = 0; i < callstack.length; i++) {
        if (sample.frames[sample.frames.length - i - 1] != callstack[i])
          return null;
      }
      sample.frames = sample.frames.slice(0, sample.frames.length - callstack.length + 1);
      return sample;
    });
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterByName: function Parser_filterByName(profile, filterName, useFunctions) {
    function getSymbolOrFunctionName(index, profile, useFunctions) {
      if (useFunctions) {
        if (!(index in profile.functions))
          return "";
        return profile.functions[index].functionName;
      }
      if (!(index in profile.symbols))
        return "";
      return profile.symbols[index].symbolName;
    }
    console.log("filtering profile by name " + filterName);
    var samples = profile.samples.clone();
    filterName = filterName.toLowerCase();
    calltrace_it: for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      if (!sample)
        continue;
      var callstack = sample.frames;
      for (var j = 0; j < callstack.length; ++j) { 
        var symbolOrFunctionName = getSymbolOrFunctionName(callstack[j], profile, useFunctions);
        if (symbolOrFunctionName.toLowerCase().indexOf(filterName) != -1) {
          continue calltrace_it;
        }
      }
      samples[i] = null;
    }
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  convertToCallTree: function Parser_convertToCallTree(profile, isReverse, finishCallback) {
    var request = new WorkerRequest(gParserWorker);
    request.send({
      task: "convertToCallTree",
      profile: profile,
      isReverse: isReverse
    });
    request.addEventListener("finished", finishCallback);
  },
  _clipText: function Tree__clipText(text, length) {
    if (text.length <= length)
      return text;
    return text.substr(0, length) + "...";
  },
  mergeUnbranchedCallPaths: function Tree_mergeUnbranchedCallPaths(root) {
    var mergedNames = [root.name];
    var node = root;
    while (node.children.length == 1 && node.count == node.children[0].count) {
      node = node.children[0];
      mergedNames.push(node.name);
    }
    if (node != root) {
      // Merge path from root to node into root.
      root.children = node.children;
      root.mergedNames = mergedNames;
      //root.name = this._clipText(root.name, 50) + " to " + this._clipText(node.name, 50);
    }
    for (var i = 0; i < root.children.length; i++) {
      this.mergeUnbranchedCallPaths(root.children[i]);
    }
  },
  discardLineLevelInformation: function Tree_discardLineLevelInformation(profile) {
    var symbols = profile.symbols;
    var data = profile.samples;
    var filteredData = [];
    for (var i = 0; i < data.length; i++) {
      if (!data[i]) {
        filteredData.push(null);
        continue;
      }
      filteredData.push(cloneSample(data[i]));
      var frames = filteredData[i].frames;
      for (var j = 0; j < frames.length; j++) {
        if (!(frames[j] in symbols))
          continue;
        frames[j] = symbols[frames[j]].functionIndex;
      }
    }
    return {
      symbols: symbols,
      functions: profile.functions,
      samples: filteredData
    };
  },
};
