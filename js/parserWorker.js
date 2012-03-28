importScripts("ProgressReporter.js");

var gProfiles = [];

var partialTaskData = {};

var gNextProfileID = 0;

self.onmessage = function (msg) {
  try {
    var requestID = msg.data.requestID;
    var task = msg.data.task;
    var taskData = msg.data.taskData;
    if (!taskData &&
        (["chunkedStart", "chunkedChunk", "chunkedEnd"].indexOf(task) == -1)) {
      taskData = partialTaskData[requestID];
      delete partialTaskData[requestID];
    }
    switch (task) {
      case "chunkedStart":
        partialTaskData[requestID] = null;
        break;
      case "chunkedChunk":
        if (partialTaskData[requestID] === null)
          partialTaskData[requestID] = msg.data.chunk;
        else
          partialTaskData[requestID] = partialTaskData[requestID].concat(msg.data.chunk);
        break;
      case "chunkedEnd":
        break;
      case "parseRawProfile":
        parseRawProfile(requestID, taskData);
        break;
      case "updateFilters":
        updateFilters(requestID, taskData.profileID, taskData.filters);
        break;
      case "updateViewOptions":
        updateViewOptions(requestID, taskData.profileID, taskData.options);
        break;
      case "getSerializedProfile":
        getSerializedProfile(requestID, taskData.profileID, taskData.complete);
        break;
      default:
        sendError(requestID, "Unknown task " + task);
        break;
    }
  } catch (e) {
    sendError(requestID, "Exception: " + e + " (" + e.fileName + ":" + e.lineNumber + ")\n");
  }
}

function sendError(requestID, error) {
  self.postMessage({
    requestID: requestID,
    type: "error",
    error: error
  });
}

function sendProgress(requestID, progress) {
  self.postMessage({
    requestID: requestID,
    type: "progress",
    progress: progress
  });
}

function sendFinished(requestID, result) {
  self.postMessage({
    requestID: requestID,
    type: "finished",
    result: result
  });
}

function bucketsBySplittingArray(array, maxCostPerBucket, costOfElementCallback) {
  var buckets = [];
  var currentBucket = [];
  var currentBucketCost = 0;
  for (var i = 0; i < array.length; i++) {
    var element = array[i];
    var costOfCurrentElement = costOfElementCallback ? costOfElementCallback(element) : 1;
    if (currentBucketCost + costOfCurrentElement > maxCostPerBucket) {
      buckets.push(currentBucket);
      currentBucket = [];
      currentBucketCost = 0;
    }
    currentBucket.push(element);
    currentBucketCost += costOfCurrentElement;
  }
  buckets.push(currentBucket);
  return buckets;
}

function sendFinishedInChunks(requestID, result, maxChunkCost, costOfElementCallback) {
  if (result.length === undefined || result.slice === undefined)
    throw new Error("Can't slice result into chunks");
  self.postMessage({
    requestID: requestID,
    type: "finishedStart"
  });
  var chunks = bucketsBySplittingArray(result, maxChunkCost, costOfElementCallback);
  for (var i = 0; i < chunks.length; i++) {
    self.postMessage({
      requestID: requestID,
      type: "finishedChunk",
      chunk: chunks[i]
    });
  }
  self.postMessage({
    requestID: requestID,
    type: "finishedEnd"
  });
}

function makeSample(frames, extraInfo) {
  return {
    frames: frames,
    extraInfo: extraInfo
  };
}

function cloneSample(sample) {
  return makeSample(sample.frames.slice(0), sample.extraInfo);
}
function parseRawProfile(requestID, rawProfile) {
  var progressReporter = new ProgressReporter();
  progressReporter.addListener(function (r) {
    sendProgress(requestID, r.getProgress());
  });
  progressReporter.begin("Parsing...");

  var symbolicationTable = {};
  var symbols = [];
  var symbolIndices = {};
  var functions = [];
  var functionIndices = {};
  var samples = [];

  if (typeof rawProfile == "string" && rawProfile[0] == "{") {
    // rawProfile is a JSON string.
    rawProfile = JSON.parse(rawProfile);
  }

  if (typeof rawProfile == "object") {
    switch (rawProfile.format) {
      case "profileStringWithSymbolicationTable,1":
        symbolicationTable = rawProfile.symbolicationTable;
        parseProfileString(rawProfile.profileString);
        break;
      case "profileJSONWithSymbolicationTable,1":
        symbolicationTable = rawProfile.symbolicationTable;
        parseProfileJSON(rawProfile.profileJSON);
        break;
      default:
        throw "Unsupported profile JSON format";
    }
  } else {
    parseProfileString(rawProfile);
  }

  function cleanFunctionName(functionName) {
    var ignoredPrefix = "non-virtual thunk to ";
    if (functionName.substr(0, ignoredPrefix.length) == ignoredPrefix)
      return functionName.substr(ignoredPrefix.length);
    return functionName;
  }

  function getFunctionInfo(fullName) {
    var match =
      /^(.*) \(in ([^\)]*)\) (\+ [0-9]+)$/.exec(fullName) ||
      /^(.*) \(in ([^\)]*)\) (\(.*:.*\))$/.exec(fullName) ||
      /^(.*) \(in ([^\)]*)\)$/.exec(fullName) ||
      /^(.*)$/.exec(fullName);
    return {
      functionName: cleanFunctionName(match[1]),
      libraryName: match[2] || "",
      lineInformation: match[3] || ""
    };
  }

  function indexForFunction(functionName, libraryName) {
    if (functionName in functionIndices)
      return functionIndices[functionName];
    var newIndex = functions.length;
    functions[newIndex] = {
      functionName: functionName,
      libraryName: libraryName
    };
    functionIndices[functionName] = newIndex;
    return newIndex;
  }

  function parseSymbol(symbol) {
    var info = getFunctionInfo(symbol);
    return {
      symbolName: symbol,
      functionIndex: indexForFunction(info.functionName, info.libraryName),
      lineInformation: info.lineInformation
    };
  }

  function translatedSymbol(symbol) {
    return symbolicationTable[symbol] || symbol;
  }

  function indexForSymbol(symbol) {
    if (symbol in symbolIndices)
      return symbolIndices[symbol];
    var newIndex = symbols.length;
    symbols[newIndex] = parseSymbol(translatedSymbol(symbol));
    symbolIndices[symbol] = newIndex;
    return newIndex;
  }

  function clearRegExpLastMatch() {
    /./.exec(" ");
  }

  function parseProfileString(data) {
    var extraInfo = {};
    var lines = data.split("\n");
    var sample = null;
    for (var i = 0; i < lines.length; ++i) {
      var line = lines[i];
      if (line.length < 2 || line[1] != '-') {
        // invalid line, ignore it
        continue;
      }
      var info = line.substring(2);
      switch (line[0]) {
      //case 'l':
      //  // leaf name
      //  if ("leafName" in extraInfo) {
      //    extraInfo.leafName += ":" + info;
      //  } else {
      //    extraInfo.leafName = info;
      //  }
      //  break;
      case 'm':
        // marker
        if (!("marker" in extraInfo)) {
          extraInfo.marker = [];
        }
        extraInfo.marker.push(info);
        break;
      case 's':
        // sample
        var sampleName = info;
        sample = makeSample([indexForSymbol(sampleName)], extraInfo);
        samples.push(sample);
        extraInfo = {}; // reset the extra info for future rounds
        break;
      case 'c':
      case 'l':
        // continue sample
        if (sample) { // ignore the case where we see a 'c' before an 's'
          sample.frames.push(indexForSymbol(info));
        }
        break;
      case 'r':
        // responsiveness
        if (sample) {
          sample.extraInfo["responsiveness"] = parseFloat(info);
        }
        break;
      }
      progressReporter.setProgress((i + 1) / lines.length);
    }
  }

  function parseProfileJSON(data) {
    for (var i = 0; i < data.length; i++) {
      var sample = data[i];
      if (sample) {
        var indicedFrames = sample.frames.map(function (frameName) {
          return indexForSymbol(frameName);
        });
        samples.push(makeSample(indicedFrames, sample.extraInfo));
      } else {
        samples.push(null);
      }
      progressReporter.setProgress((i + 1) / data.length);
    }
  }

  progressReporter.finish();
  var profileID = gNextProfileID++;
  gProfiles[profileID] = JSON.parse(JSON.stringify({
    symbols: symbols,
    functions: functions,
    allSamples: samples
  }));
  clearRegExpLastMatch();
  sendFinished(requestID, {
    numSamples: samples.length,
    profileID: profileID,
    symbols: symbols,
    functions: functions
  });
}

function getSerializedProfile(requestID, profileID, complete) {
  var profile = gProfiles[profileID];
  var symbolicationTable = {};
  if (complete || !profile.filterSettings.mergeFunctions) {
    for (var symbolIndex in profile.symbols) {
      symbolicationTable[symbolIndex] = profile.symbols[symbolIndex].symbolName;
    }
  } else {
    for (var functionIndex in profile.functions) {
      var f = profile.functions[functionIndex];
      symbolicationTable[functionIndex] = f.functionName + " (in " + f.libraryName + ")";
    }
  }
  var serializedProfile = JSON.stringify({
    format: "profileJSONWithSymbolicationTable,1",
    profileJSON: complete ? profile.allSamples : profile.filteredSamples,
    symbolicationTable: symbolicationTable
  });
  sendFinished(requestID, serializedProfile);
}

function TreeNode(name, parent, startCount) {
  this.name = name;
  this.children = [];
  this.counter = startCount;
  this.parent = parent;
}
TreeNode.prototype.getDepth = function TreeNode__getDepth() {
  if (this.parent)
    return this.parent.getDepth() + 1;
  return 0;
};
TreeNode.prototype.findChild = function TreeNode_findChild(name) {
  for (var i = 0; i < this.children.length; i++) {
    var child = this.children[i];
    if (child.name == name)
      return child;
  }
  return null;
}
// path is an array of strings which is matched to our nodes' names.
// Try to walk path in our own tree and return the last matching node. The
// length of the match can be calculated by the caller by comparing the
// returned node's depth with the depth of the path's start node.
TreeNode.prototype.followPath = function TreeNode_followPath(path) {
  if (path.length == 0)
    return this;

  var matchingChild = this.findChild(path[0]);
  if (!matchingChild)
    return this;

  return matchingChild.followPath(path.slice(1));
};
TreeNode.prototype.incrementCountersInParentChain = function TreeNode_incrementCountersInParentChain() {
  this.counter++;
  if (this.parent)
    this.parent.incrementCountersInParentChain();
};

function convertToCallTree(samples, isReverse) {
  samples = samples.filter(function noNullSamples(sample) {
    return sample != null;
  });
  if (samples.length == 0)
    return new TreeNode("(empty)", null, 0);
  var treeRoot = new TreeNode(isReverse ? "(total)" : samples[0].frames[0], null, 0);
  for (var i = 0; i < samples.length; ++i) {
    var sample = samples[i];
    var callstack = sample.frames.slice(0);
    callstack.shift();
    if (isReverse)
      callstack.reverse();
    var deepestExistingNode = treeRoot.followPath(callstack);
    var remainingCallstack = callstack.slice(deepestExistingNode.getDepth());
    deepestExistingNode.incrementCountersInParentChain();
    var node = deepestExistingNode;
    for (var j = 0; j < remainingCallstack.length; ++j) {
      var frame = remainingCallstack[j];
      var child = new TreeNode(frame, node, 1);
      node.children.push(child);
      node = child;
    }
  }
  return treeRoot;
}

function filterByJank(samples, filterThreshold) {
  return samples.map(function nullNonJank(sample) {
    if (!sample ||
        !("responsiveness" in sample.extraInfo) ||
        sample.extraInfo["responsiveness"] < filterThreshold)
      return null;
    return sample;
  });
}

function filterBySymbol(samples, symbolOrFunctionIndex) {
  return samples.map(function filterSample(origSample) {
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
}

function filterByCallstackPrefix(samples, callstack) {
  return samples.map(function filterSample(origSample) {
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
}

function filterByCallstackPostfix(samples, callstack) {
  return samples.map(function filterSample(origSample) {
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
}

function filterByName(samples, symbols, functions, filterName, useFunctions) {
  function getSymbolOrFunctionName(index, profile, useFunctions) {
    if (useFunctions) {
      if (!(index in functions))
        return "";
      return functions[index].functionName;
    }
    if (!(index in symbols))
      return "";
    return symbols[index].symbolName;
  }
  samples = samples.slice(0);
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
  return samples;
}

function discardLineLevelInformation(samples, symbols, functions) {
  var data = samples;
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
  return filteredData;
}

function mergeUnbranchedCallPaths(root) {
  var mergedNames = [root.name];
  var node = root;
  while (node.children.length == 1 && node.counter == node.children[0].counter) {
    node = node.children[0];
    mergedNames.push(node.name);
  }
  if (node != root) {
    // Merge path from root to node into root.
    root.children = node.children;
    root.mergedNames = mergedNames;
    //root.name = clipText(root.name, 50) + " to " + this._clipText(node.name, 50);
  }
  for (var i = 0; i < root.children.length; i++) {
    mergeUnbranchedCallPaths(root.children[i]);
  }
}

function FocusedFrameSampleFilter(focusedSymbol) {
  this._focusedSymbol = focusedSymbol;
}
FocusedFrameSampleFilter.prototype = {
  filter: function FocusedFrameSampleFilter_filter(samples, symbols, functions) {
    return filterBySymbol(samples, this._focusedSymbol);
  }
};

function FocusedCallstackPrefixSampleFilter(focusedCallstack) {
  this._focusedCallstackPrefix = focusedCallstack;
}
FocusedCallstackPrefixSampleFilter.prototype = {
  filter: function FocusedCallstackPrefixSampleFilter_filter(samples, symbols, functions) {
    return filterByCallstackPrefix(samples, this._focusedCallstackPrefix);
  }
};

function FocusedCallstackPostfixSampleFilter(focusedCallstack) {
  this._focusedCallstackPostfix = focusedCallstack;
}
FocusedCallstackPostfixSampleFilter.prototype = {
  filter: function FocusedCallstackPostfixSampleFilter_filter(samples, symbols, functions) {
    return filterByCallstackPostfix(samples, this._focusedCallstackPostfix);
  }
};

function RangeSampleFilter(start, end) {
  this._start = start;
  this._end = end;
}
RangeSampleFilter.prototype = {
  filter: function RangeSampleFilter_filter(samples, symbols, functions) {
    return samples.slice(this._start, this._end);
  }
}

function unserializeSampleFilters(filters) {
  return filters.map(function (filter) {
    switch (filter.type) {
      case "FocusedFrameSampleFilter":
        return new FocusedFrameSampleFilter(filter.focusedSymbol);
      case "FocusedCallstackPrefixSampleFilter":
        return new FocusedCallstackPrefixSampleFilter(filter.focusedCallstack);
      case "FocusedCallstackPostfixSampleFilter":
        return new FocusedCallstackPostfixSampleFilter(filter.focusedCallstack);
      case "RangeSampleFilter":
        return new RangeSampleFilter(filter.start, filter.end);
      default:
        throw "Unknown filter";
    }
  })
}

var gJankThreshold = 50 /* ms */;

function updateFilters(requestID, profileID, filters) {
  var profile = gProfiles[profileID];
  var samples = profile.allSamples;
  var symbols = profile.symbols;
  var functions = profile.functions;

  if (filters.mergeFunctions) {
    samples = discardLineLevelInformation(samples, symbols, functions);
  }
  if (filters.nameFilter) {
    samples = filterByName(samples, symbols, functions, filters.nameFilter, filters.mergeFunctions);
  }
  samples = unserializeSampleFilters(filters.sampleFilters).reduce(function (filteredSamples, currentFilter) {
    return currentFilter.filter(filteredSamples, symbols, functions);
  }, samples);
  if (filters.jankOnly) {
    samples = filterByJank(samples, gJankThreshold);
  }

  gProfiles[profileID].filterSettings = filters;
  gProfiles[profileID].filteredSamples = samples;
  sendFinishedInChunks(requestID, samples, 40000,
                       function (sample) { return sample ? sample.frames.length : 1; });
}

function updateViewOptions(requestID, profileID, options) {
  var profile = gProfiles[profileID];
  var samples = profile.filteredSamples;
  var symbols = profile.symbols;
  var functions = profile.functions;

  var treeData = convertToCallTree(samples, options.invertCallstack);
  if (options.mergeUnbranched)
    mergeUnbranchedCallPaths(treeData);
  sendFinished(requestID, treeData);
}
