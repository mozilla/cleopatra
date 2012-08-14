/* -*- Mode: js2; indent-tabs-mode: nil; js2-basic-offset: 2; -*- */

importScripts("ProgressReporter.js");

var gProfiles = [];

var partialTaskData = {};

var gNextProfileID = 0;

var gLogLines = [];

// http://stackoverflow.com/a/2548133
function endsWith(str, suffix) {
      return str.indexOf(suffix, this.length - suffix.length) !== -1;
};

// functions for which lr is unconditionally valid.  These are
// largely going to be atomics and other similar functions
// that don't touch lr.  This is currently populated with
// some functions from bionic, largely via manual inspection
// of the assembly in e.g.
// http://androidxref.com/source/xref/bionic/libc/arch-arm/syscalls/
var sARMFunctionsWithValidLR = [
  "__atomic_dec",
  "__atomic_inc",
  "__atomic_cmpxchg",
  "__atomic_swap",
  "__atomic_dec",
  "__atomic_inc",
  "__atomic_cmpxchg",
  "__atomic_swap",
  "__futex_syscall3",
  "__futex_wait",
  "__futex_wake",
  "__futex_syscall3",
  "__futex_wait",
  "__futex_wake",
  "__futex_syscall4",
  "__ioctl",
  "__brk",
  "__wait4",
  "epoll_wait",
  "fsync",
  "futex",
  "nanosleep",
  "pause",
  "sched_yield",
  "syscall"
];

function log() {
  var z = [];
  for (var i = 0; i < arguments.length; ++i)
    z.push(arguments[i]);
  gLogLines.push(z.join(" "));
}

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
    dump("Start task: " + task + "\n");

    gLogLines = [];

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
    dump("Complete task: " + task + "\n");
  } catch (e) {
    dump("Exception: " + e + " (" + e.fileName + ":" + e.lineNumber + ")\n");
    sendError(requestID, "Exception: " + e + " (" + e.fileName + ":" + e.lineNumber + ")\n");
  }
}

function sendError(requestID, error) {
  self.postMessage({
    requestID: requestID,
    type: "error",
    error: error,
    log: gLogLines
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
    result: result,
    log: gLogLines
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
    type: "finishedEnd",
    log: gLogLines
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
  var meta = null;
  var armIncludePCIndex = {};

  if (typeof rawProfile == "string" && rawProfile[0] == "{") {
    // rawProfile is a JSON string.
    rawProfile = JSON.parse(rawProfile);
  }

  if (!rawProfile.profileJSON.meta  && rawProfile.meta) {
    rawProfile.profileJSON.meta = rawProfile.meta;
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
        throw new Error("Unsupported profile JSON format");
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

  function parseResourceName(url) {
    // TODO Fix me, this certainly doesn't handle all URLs formats
    var match = /^.*:\/\/(.*?)\/.*$/.exec(url);

    if (!match)
      return url;

    if (meta && meta.addons && url.indexOf("resource:") == 0 && endsWith(match[1], "-at-jetpack")) {
      // Assume this is a jetpack url
      var jetpackID = match[1].substring(0, match[1].length - 11) + "@jetpack";

      for (var i in meta.addons) {
        var addon = meta.addons[i];
        dump("match " + addon.id + " vs. " + jetpackID + "\n");
        // TODO handle lowercase name collision
        if (addon.id.toLowerCase() == jetpackID.toLowerCase()) {
          dump("Found addon: " + addon.name + "\n");
          var iconHTML = "";
          if (addon.iconURL)
            iconHTML = "<img src=\"" + addon.iconURL + "\" style='width:12px; height:12px;'> "
          return iconHTML + " Jetpack: " + addon.name;
        }
      }
      dump("Found jetpackID: " + jetpackID + "\n");
    }

    var iconHTML = "";
    if (url.indexOf("http://") == 0) {
      iconHTML = "<img src=\"http://" + match[1] + "/favicon.ico\" style='width:12px; height:12px;'> ";
    } else if (url.indexOf("https://") == 0) {
      iconHTML = "<img src=\"https://" + match[1] + "/favicon.ico\" style='width:12px; height:12px;'> ";
    }
    return iconHTML + match[1];
  }

  function parseScriptFile(url) {
     // TODO Fix me, this certainly doesn't handle all URLs formats
     var match = /^.*\/(.*)\.js$/.exec(url);

     if (!match)
       return url;

     return match[1] + ".js";
  }

  function parseScriptURI(url) {
    if (url) {
      var urlTokens = url.split(" ");
      url = urlTokens[urlTokens.length-1];
    }
    return url;
  }

  function getFunctionInfo(fullName) {
    var isJSFrame = false;
    var match =
      /^(.*) \(in ([^\)]*)\) (\+ [0-9]+)$/.exec(fullName) ||
      /^(.*) \(in ([^\)]*)\) (\(.*:.*\))$/.exec(fullName) ||
      /^(.*) \(in ([^\)]*)\)$/.exec(fullName);
      // Try to parse a JS frame
    var scriptLocation = null;
    var jsMatch1 = match ||
      /^(.*) \((.*):([0-9]+)\)$/.exec(fullName);
    if (!match && jsMatch1) {
      scriptLocation = {
        scriptURI: parseScriptURI(jsMatch1[2]),
        lineInformation: jsMatch1[3]
      };
      match = [0, jsMatch1[1]+"() @ "+parseScriptFile(jsMatch1[2]) + ":" + jsMatch1[3], parseResourceName(jsMatch1[2]), ""];
      isJSFrame = true;
    }
    var jsMatch2 = match ||
      /^(.*):([0-9]+)$/.exec(fullName);
    if (!match && jsMatch2) {
      scriptLocation = {
        scriptURI: parseScriptURI(jsMatch2[1]),
        lineInformation: jsMatch2[2]
      };
      match = [0, "<Anonymous> @ "+parseScriptFile(jsMatch2[1]) + ":" + jsMatch2[2], parseResourceName(jsMatch2[1]), ""];
      isJSFrame = true;
    }
    if (!match) {
      match = [fullName, fullName];
    }
    return {
      functionName: cleanFunctionName(match[1]),
      libraryName: match[2] || "",
      lineInformation: match[3] || "",
      isJSFrame: isJSFrame,
      scriptLocation: scriptLocation
    };
  }

  function indexForFunction(functionName, libraryName, isJSFrame, scriptLocation) {
    var resolve = functionName+"_LIBNAME_"+libraryName;
    if (resolve in functionIndices)
      return functionIndices[resolve];
    var newIndex = functions.length;
    functions[newIndex] = {
      functionName: functionName,
      libraryName: libraryName,
      isJSFrame: isJSFrame,
      scriptLocation: scriptLocation
    };
    functionIndices[resolve] = newIndex;
    return newIndex;
  }

  function parseSymbol(symbol) {
    var info = getFunctionInfo(symbol);
    return {
      symbolName: symbol,
      functionName: info.functionName,
      functionIndex: indexForFunction(info.functionName, info.libraryName, info.isJSFrame, info.scriptLocation),
      lineInformation: info.lineInformation,
      isJSFrame: info.isJSFrame,
      scriptLocation: info.scriptLocation
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

  function shouldIncludeARMLRForPC(pcIndex) {
    if (pcIndex in armIncludePCIndex)
      return armIncludePCIndex[pcIndex];

    var pcName = symbols[pcIndex].functionName;
    var include = sARMFunctionsWithValidLR.indexOf(pcName) != -1;
    armIncludePCIndex[pcIndex] = include;
    return include;
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
      case 'L':
        // continue sample; this is an ARM LR record.  Stick it before the
        // PC if it's one of the functions where we know LR is good.
        if (sample && sample.frames.length > 1) {
          var pcIndex = sample.frames[sample.frames.length - 1];
          if (shouldIncludeARMLRForPC(pcIndex)) {
            sample.frames.splice(-1, 0, indexForSymbol(info));
          }
        }
        break;
      case 't':
        // time
        if (sample) {
          sample.extraInfo["time"] = parseFloat(info);
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

  function parseProfileJSON(profile) {
    // Thread 0 will always be the main thread of interest
    // TODO support all the thread in the profile
    var profileSamples = null;
    meta = profile.meta;
    // Support older format that aren't thread aware
    if (profile.threads != null) {
      profileSamples = profile.threads[0].samples;
    } else {
      profileSamples = profile;
    }
    var rootSymbol = null;
    var insertCommonRoot = false;
    for (var j = 0; j < profileSamples.length; j++) {
      var sample = profileSamples[j];
      var indicedFrames = [];
      if (!sample) {
        // This sample was filtered before saving
        samples.push(null);
        progressReporter.setProgress((j + 1) / profileSamples.length);
        continue;
      }
      for (var k = 0; sample.frames && k < sample.frames.length; k++) {
        var frame = sample.frames[k];
        if (frame.location !== undefined) {
          indicedFrames.push(indexForSymbol(frame.location));
        } else {
          indicedFrames.push(indexForSymbol(frame));
        }
      }
      if (indicedFrames.length >= 1) {
        if (rootSymbol && rootSymbol != indicedFrames[0]) {
          insertCommonRoot = true;
        }
        rootSymbol = rootSymbol || indicedFrames[0];
      }
      if (sample.extraInfo == null) {
        sample.extraInfo = {};
      }
      if (sample.responsiveness) {
        sample.extraInfo["responsiveness"] = sample.responsiveness;
      }
      if (sample.responsiveness) {
        sample.extraInfo["time"] = sample.time;
      }
      samples.push(makeSample(indicedFrames, sample.extraInfo));
      progressReporter.setProgress((j + 1) / profileSamples.length);
    }
    if (insertCommonRoot) {
      var rootIndex = indexForSymbol("(root)");
      for (var i = 0; i < samples.length; i++) {
        var sample = samples[i];
        if (!sample) continue;
        // If length == 0 then the sample was filtered when saving the profile
        if (sample.frames.length >= 1 && sample.frames[0] != rootIndex)
          sample.frames.splice(0, 0, rootIndex)
      }
    }
  }

  progressReporter.finish();
  var profileID = gNextProfileID++;
  gProfiles[profileID] = JSON.parse(JSON.stringify({
    meta: meta,
    symbols: symbols,
    functions: functions,
    allSamples: samples
  }));
  clearRegExpLastMatch();
  sendFinished(requestID, {
    meta: meta,
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
    meta: profile.meta,
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
  function getSymbolOrFunctionName(index, useFunctions) {
    if (useFunctions) {
      if (!(index in functions))
        return "";
      return functions[index].functionName;
    }
    if (!(index in symbols))
      return "";
    return symbols[index].symbolName;
  }
  function getLibraryName(index, useFunctions) {
    if (useFunctions) {
      if (!(index in functions))
        return "";
      return functions[index].libraryName;
    }
    if (!(index in symbols))
      return "";
    return symbols[index].libraryName;
  }
  samples = samples.slice(0);
  filterName = filterName.toLowerCase();
  calltrace_it: for (var i = 0; i < samples.length; ++i) {
    var sample = samples[i];
    if (!sample)
      continue;
    var callstack = sample.frames;
    for (var j = 0; j < callstack.length; ++j) { 
      var symbolOrFunctionName = getSymbolOrFunctionName(callstack[j], useFunctions);
      var libraryName = getLibraryName(callstack[j], useFunctions);
      if (symbolOrFunctionName.toLowerCase().indexOf(filterName) != -1 || 
          libraryName.toLowerCase().indexOf(filterName) != -1) {
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
      case "PluginView":
        return null;
      default:
        throw new Error("Unknown filter");
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
  if (filters.javascriptOnly) {
    try {
      samples = filterByName(samples, symbols, functions, "runScript", filters.mergeFunctions);
    } catch (e) {
      dump("Could not filer by javascript: " + e + "\n");
    }
  }
  if (filters.nameFilter) {
    try {
      samples = filterByName(samples, symbols, functions, filters.nameFilter, filters.mergeFunctions);
    } catch (e) {
      dump("Could not filer by name: " + e + "\n");
    }
  }
  samples = unserializeSampleFilters(filters.sampleFilters).reduce(function (filteredSamples, currentFilter) {
    if (currentFilter===null) return filteredSamples;
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
