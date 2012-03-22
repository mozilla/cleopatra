importScripts("ProgressReporter.js");

var gProfiles = [];

self.onmessage = function (msg) {
  try {
    switch (msg.data.task) {
      case "parseRawProfile":
        parseRawProfile(msg.data.requestID, msg.data.rawProfile, msg.data.profileID);
        break;
      case "updateFilters":
        updateFilters(msg.data.requestID, msg.data.profileID, msg.data.filters);
        break;
      case "updateViewOptions":
        updateViewOptions(msg.data.requestID, msg.data.profileID, msg.data.options);
        break;
      default:
        sendError(msg.data.requestID, "Unknown task " + msg.data.task);
        break;
    }
  } catch (e) {
    sendError(msg.data.requestID, "Exception: " + e + " (" + e.fileName + ":" + e.lineNumber + ")\n");
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

function makeSample(frames, extraInfo, lines) {
  return {
    frames: frames,
    extraInfo: extraInfo,
    lines: lines
  };
}

function cloneSample(sample) {
  return makeSample(sample.frames.slice(0), sample.extraInfo, sample.lines.slice(0));
}
function parseRawProfile(requestID, rawProfile, profileID) {
  var progressReporter = new ProgressReporter();
  progressReporter.addListener(function (r) {
    sendProgress(requestID, r.getProgress());
  });
  progressReporter.begin("Parsing...");

  var symbolicationTable = {};

  if (typeof rawProfile == "string" && rawProfile[0] == "{") {
    // rawProfile is a JSON string.
    rawProfile = JSON.parse(rawProfile);
  }
  if (typeof rawProfile == "object") {
    switch (rawProfile.format) {
      case "profileStringWithSymbolicationTable,1":
        symbolicationTable = rawProfile.symbolicationTable;
        rawProfile = rawProfile.profileString;
        break;
      default:
        throw "Unsupported profile JSON format";
    }
  }

  var data = rawProfile;
  var lines = data.split("\n");
  var extraInfo = {};
  var symbols = [];
  var symbolIndices = {};
  var functions = [];
  var functionIndices = {};

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

  var samples = [];
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
      sample = makeSample([indexForSymbol(sampleName)], extraInfo, []);
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
    if (sample != null)
      sample.lines.push(line);
    progressReporter.setProgress((i + 1) / lines.length);
  }
  progressReporter.finish();
  gProfiles[profileID] = {
    parsedProfile: { symbols: symbols, functions: functions, samples: samples }
  };
  sendFinished(requestID, {
    numSamples: samples.length,
    symbols: symbols,
    functions: functions
  });
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

function convertToCallTree(profile, isReverse) {
  var samples = profile.samples.filter(function noNullSamples(sample) {
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

function filterByJank(profile, filterThreshold) {
  var samples = profile.samples.slice(0);
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
}

function filterBySymbol(profile, symbolOrFunctionIndex) {
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
}

function filterByCallstackPrefix(profile, callstack) {
  var samples = profile.samples.map(function filterSample(origSample) {
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
}

function filterByCallstackPostfix(profile, callstack) {
  var samples = profile.samples.map(function filterSample(origSample) {
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
}

function filterByName(profile, filterName, useFunctions) {
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
  var samples = profile.samples.slice(0);
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
}

function discardLineLevelInformation(profile) {
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
}

function mergeUnbranchedCallPaths(root) {
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
  filter: function FocusedFrameSampleFilter_filter(profile) {
    return filterBySymbol(profile, this._focusedSymbol);
  }
};

function FocusedCallstackPrefixSampleFilter(focusedCallstack) {
  this._focusedCallstackPrefix = focusedCallstack;
}
FocusedCallstackPrefixSampleFilter.prototype = {
  filter: function FocusedCallstackPrefixSampleFilter_filter(profile) {
    return filterByCallstackPrefix(profile, this._focusedCallstackPrefix);
  }
};

function FocusedCallstackPostfixSampleFilter(focusedCallstack) {
  this._focusedCallstackPostfix = focusedCallstack;
}
FocusedCallstackPostfixSampleFilter.prototype = {
  filter: function FocusedCallstackPostfixSampleFilter_filter(profile) {
    return filterByCallstackPostfix(profile, this._focusedCallstackPostfix);
  }
};

function RangeSampleFilter(start, end) {
  this._start = start;
  this._end = end;
}
RangeSampleFilter.prototype = {
  filter: function RangeSampleFilter_filter(profile) {
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: profile.samples.slice(this._start, this._end)
    };
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
  var data = gProfiles[profileID].parsedProfile;

  if (filters.mergeFunctions) {
    data = discardLineLevelInformation(data);
  }
  if (filters.nameFilter) {
    data = filterByName(data, filters.nameFilter);
  }
  var sampleFilters = unserializeSampleFilters(filters.sampleFilters);
  for (var i = 0; i < sampleFilters.length; i++) {
    data = sampleFilters[i].filter(data);
  }
  if (filters.jankOnly) {
    data = filterByJank(data, gJankThreshold);
  }

  gProfiles[profileID].filteredProfile = data;
  sendFinished(requestID, data);
}

function updateViewOptions(requestID, profileID, options) {
  var data = gProfiles[profileID].filteredProfile;
  var treeData = convertToCallTree(data, options.invertCallstack);
  if (options.mergeUnbranched)
    mergeUnbranchedCallPaths(treeData);
  sendFinished(requestID, treeData);
}
