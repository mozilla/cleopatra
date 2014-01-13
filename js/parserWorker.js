/* -*- Mode: js2; indent-tabs-mode: nil; js2-basic-offset: 2; -*- */

importScripts("ProgressReporter.js");

var gProfiles = [];

var partialTaskData = {};

var gNextProfileID = 0;

var gLogLines = [];

var gDebugLog = false;
var gDebugTrace = false;
// Use for verbose tracing, otherwise use log
function PROFILDERTRACE(msg) {
  if (gDebugTrace)
    PROFILERLOG(msg);
}
function PROFILERLOG(msg) {
  if (gDebugLog) {
    msg = "Cleo: " + msg;
    //if (window.dump)
    //  window.dump(msg + "\n");
  }
}
function PROFILERERROR(msg) {
  msg = "Cleo: " + msg;
  //if (window.dump)
  //  window.dump(msg + "\n");
}

// http://stackoverflow.com/a/2548133
function endsWith(str, suffix) {
      return str.indexOf(suffix, this.length - suffix.length) !== -1;
};

// https://bugzilla.mozilla.org/show_bug.cgi?id=728780
if (!String.prototype.startsWith) {
  String.prototype.startsWith =
    function(s) { return this.lastIndexOf(s, 0) === 0; }
}

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
    PROFILERLOG("Start task: " + task);

    gLogLines = [];

    switch (task) {
      case "initWorker":
        gDebugLog = taskData.debugLog;
        gDebugTrace = taskData.debugTrace;
        PROFILERLOG("Init logging in parserWorker");
        return;
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
        parseRawProfile(requestID, msg.data.params, taskData);
        break;
      case "updateFilters":
        updateFilters(requestID, taskData.profileID, taskData.filters, taskData.threadId);
        break;
      case "updateViewOptions":
        updateViewOptions(requestID, taskData.profileID, taskData.options, taskData.threadId);
        break;
      case "getSerializedProfile":
        getSerializedProfile(requestID, taskData.profileID, taskData.complete);
        break;
      case "getHistogramBoundaries":
        getHistogramBoundaries(requestID, taskData.profileID, taskData.showMissedSample, taskData.threadId);
        break;
      case "calculateHistogramData":
        calculateHistogramData(requestID, taskData.profileID, taskData.showMissedSample, taskData.options, taskData.threadId);
        break;
      case "calculateWaterfallData":
        calculateWaterfallData(requestID, taskData.profileID, taskData.boundaries);
        break;
      case "calculateDiagnosticItems":
        calculateDiagnosticItems(requestID, taskData.profileID, taskData.meta, taskData.threadId);
        break;
      case "changeWorseResponsiveness":
        kDelayUntilWorstResponsiveness = taskData.res;
        break;
      case "addComment":
        addComment(requestID, taskData.profileID, taskData.threadId, taskData.sampleId, taskData.comment);
        break;
      default:
        sendError(requestID, "Unknown task " + task);
        break;
    }
    PROFILERLOG("Complete task: " + task);
  } catch (e) {
    PROFILERERROR("Exception: " + e + " (" + e.fileName + ":" + e.lineNumber + ")");
    sendError(requestID, "Exception: " + e + " (" + e.fileName + ":" + e.lineNumber + ")");
  }
}

function sendError(requestID, error) {
  // support sendError(msg)
  if (error == null) {
    error = requestID;
    requestID = null;
  }

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

function sendLog() {
  self.postMessage({
    type: "log",
    params: Array.slice.call(null, arguments)
  });
}

function addComment(requestID, profileID, threadId, sampleId, comment) {
  var profile = gProfiles[profileID];
  var samples = profile.threads[threadId].samples;
  var extraInfo = samples[sampleId].extraInfo;

  if (!("marker" in extraInfo)) {
    extraInfo.marker = [];
  }
  extraInfo.marker.push({
    name: comment,
    type: 'comment'
  });

  sendFinished(requestID, true);
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
function parseRawProfile(requestID, params, rawProfile) {
  var progressReporter = new ProgressReporter();
  progressReporter.addListener(function (r) {
    sendProgress(requestID, r.getProgress());
  });
  progressReporter.begin("Parsing...");

  var symbolicationTable = {};
  var symbols = [];
  var symbolIndices = {};
  var resources = {};
  var functions = [];
  var functionIndices = {};
  var threads = {};
  var meta = {};
  var armIncludePCIndex = {};

  if (rawProfile == null) {
    throw "rawProfile is null";
  }

  if (typeof rawProfile == "string" && rawProfile[0] == "{") {
    // rawProfile is a JSON string.
    rawProfile = JSON.parse(rawProfile);
    if (rawProfile === null) {
      throw "rawProfile couldn't not successfully be parsed using JSON.parse. Make sure that the profile is a valid JSON encoding.";
    }
  }

  if (rawProfile.profileJSON && !rawProfile.profileJSON.meta && rawProfile.meta) {
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
        parseProfileJSON(rawProfile);
    }
  } else {
    parseProfileString(rawProfile);
  }

  if (params.profileId) {
    meta.profileId = params.profileId;
  }

  function cleanFunctionName(functionName) {
    var ignoredPrefix = "non-virtual thunk to ";
    if (functionName.startsWith(ignoredPrefix))
      return functionName.substr(ignoredPrefix.length);
    return functionName;
  }

  function resourceNameForAddon(addon) {
    if (!addon)
      return "";

    var iconHTML = "";
    if (addon.iconURL)
      iconHTML = "<img src=\"" + addon.iconURL + "\" style='width:12px; height:12px;'> "
    return iconHTML + " " + (/@jetpack$/.exec(addon.id) ? "Jetpack: " : "") + addon.name;
  }

  function addonWithID(addonID) {
    return firstMatch(meta.addons, function addonHasID(addon) {
      return addon.id.toLowerCase() == addonID.toLowerCase();
    })
  }

  function resourceNameForAddonWithID(addonID) {
    return resourceNameForAddon(addonWithID(addonID));
  }

  function findAddonForChromeURIHost(host) {
    return firstMatch(meta.addons, function addonUsesChromeURIHost(addon) {
      return addon.chromeURIHosts && addon.chromeURIHosts.indexOf(host) != -1;
    });
  }

  function ensureResource(name, resourceDescription) {
    if (!(name in resources)) {
      resources[name] = resourceDescription;
    }
    return name;
  }

  function resourceNameFromLibrary(library) {
    return ensureResource("lib_" + library, {
      type: "library",
      name: library
    });
  }

  function getAddonForScriptURI(url, host) {
    if (!meta || !meta.addons)
      return null;

    if (url.startsWith("resource:") && endsWith(host, "-at-jetpack")) {
      // Assume this is a jetpack url
      var jetpackID = host.substring(0, host.length - 11) + "@jetpack";
      return addonWithID(jetpackID);
    }

    if (url.startsWith("file:///") && url.indexOf("/extensions/") != -1) {
      var unpackedAddonNameMatch = /\/extensions\/(.*?)\//.exec(url);
      if (unpackedAddonNameMatch)
        return addonWithID(decodeURIComponent(unpackedAddonNameMatch[1]));
      return null;
    }

    if (url.startsWith("jar:file:///") && url.indexOf("/extensions/") != -1) {
      var packedAddonNameMatch = /\/extensions\/(.*?).xpi/.exec(url);
      if (packedAddonNameMatch)
        return addonWithID(decodeURIComponent(packedAddonNameMatch[1]));
      return null;
    }

    if (url.startsWith("chrome://")) {
      var chromeURIMatch = /chrome\:\/\/(.*?)\//.exec(url);
      if (chromeURIMatch)
        return findAddonForChromeURIHost(chromeURIMatch[1]);
      return null;
    }

    return null;
  }

  function resourceNameFromURI(url) {
    if (!url)
      return ensureResource("unknown", {type: "unknown", name: "<unknown>"});

    var match = /^(.*):\/\/(.*?)\//.exec(url);

    if (!match) {
      // Can this happen? If so, we should change the regular expression above.
      return ensureResource("url_" + url, {type: "url", name: url});
    }

    var urlRoot = match[0];
    var protocol = match[1];
    var host = match[2];

    var addon = getAddonForScriptURI(url, host);
    if (addon) {
      return ensureResource("addon_" + addon.id, {
        type: "addon",
        name: addon.name,
        addonID: addon.id,
        icon: addon.iconURL
      });
    }

    if (protocol.startsWith("http")) {
      return ensureResource("webhost_" + host, {
        type: "webhost",
        name: host,
        icon: urlRoot + "favicon.ico"
      });
    }

    return ensureResource("otherhost_" + host, {
      type: "otherhost",
      name: host
    });
  }

  function parseScriptFile(url) {
     var match = /([^\/]*)$/.exec(url);
     if (match && match[1])
       return match[1];

     return url;
  }

  // JS File information sometimes comes with multiple URIs which are chained
  // with " -> ". We only want the last URI in this list.
  function getRealScriptURI(url) {
    if (url) {
      var urls = url.split(" -> ");
      return urls[urls.length - 1];
    }
    return url;
  }

  function getFunctionInfo(fullName) {

    function getCPPFunctionInfo(fullName) {
      var match =
        /^(.*) \(in ([^\)]*)\) (\+ [0-9]+)$/.exec(fullName) ||
        /^(.*) \(in ([^\)]*)\) (\(.*:.*\))$/.exec(fullName) ||
        /^(.*) \(in ([^\)]*)\)$/.exec(fullName);

      if (!match)
        return null;

      return {
        functionName: cleanFunctionName(match[1]),
        libraryName: resourceNameFromLibrary(match[2]),
        lineInformation: match[3] || "",
        isRoot: false,
        isJSFrame: false
      };
    }

    function getJSFunctionInfo(fullName) {
      var jsMatch =
        /^(.*) \((.*):([0-9]+)\)$/.exec(fullName) ||
        /^()(.*):([0-9]+)$/.exec(fullName);

      if (!jsMatch)
        return null;

      var functionName = jsMatch[1] || "<Anonymous>";
      var scriptURI = getRealScriptURI(jsMatch[2]);
      var lineNumber = jsMatch[3];
      var scriptFile = parseScriptFile(scriptURI);
      var resourceName = resourceNameFromURI(scriptURI);

      return {
        functionName: functionName + "() @ " + scriptFile + ":" + lineNumber,
        libraryName: resourceName,
        lineInformation: "",
        isRoot: false,
        isJSFrame: true,
        scriptLocation: {
          scriptURI: scriptURI,
          lineInformation: lineNumber
        }
      };
    }

    function getFallbackFunctionInfo(fullName) {
      return {
        functionName: cleanFunctionName(fullName),
        libraryName: "",
        lineInformation: "",
        isRoot: fullName == "(root)",
        isJSFrame: false
      };
    }

    return getCPPFunctionInfo(fullName) ||
           getJSFunctionInfo(fullName) ||
           getFallbackFunctionInfo(fullName);
  }

  function indexForFunction(symbol, info) {
    var resolve = info.functionName + "__" + info.libraryName;
    if (resolve in functionIndices)
      return functionIndices[resolve];
    var newIndex = functions.length;
    info.symbol = symbol;
    functions[newIndex] = info;
    functionIndices[resolve] = newIndex;
    return newIndex;
  }

  function parseSymbol(symbol) {
    var info = getFunctionInfo(symbol);
    //dump("Parse symbol: " + symbol + "\n");
    return {
      symbolName: symbol,
      functionName: info.functionName,
      functionIndex: indexForFunction(symbol, info),
      lineInformation: info.lineInformation,
      isRoot: info.isRoot,
      isJSFrame: info.isJSFrame,
      scriptLocation: info.scriptLocation
    };
  }

  function translatedSymbol(symbol) {
    return symbolicationTable[symbol] || symbol;
  }

  function makeMissedSample(parentIndex, time) {
    return makeSample(
        [parentIndex, indexForSymbol("Missed")],
        {time:time}
    );
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

  // Markers before bug 867757 were just a simple string.
  // This will upgrade the marker if they are a string
  function prepareMarker(markerArray) {
    for (var i = 0; i < markerArray.length; i++) {
      var marker = markerArray[i];
      if (typeof marker == "string") {
        markerArray[i] = {
          name: marker,
        };
      }
      if (marker.data && marker.data.stack && marker.data.stack.samples) {
        // the stack is actually a simple profile with one sample. Let's replace it by a single stack
        var simpleStack = [];
        for (var a = 0; a < marker.data.stack.samples.length; a++) {
          var nestedSample = marker.data.stack.samples[a];
          for (var b = 0; b < nestedSample.frames.length; b++) {
            var frame = nestedSample.frames[b];
            if (frame.location) {
              simpleStack.push(indexForSymbol(frame.location));
            }
          }
        }
        markerArray[i].data.stack = simpleStack;
      }
    }
  }

  function parseProfileString(data) {
    var extraInfo = {};
    var lines = data.split("\n");
    var sample = null;
    var samples = [];
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
        prepareMarker(extraInfo.marker);
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
    threads[0] = {
      name: "Main (Text Prof)",
      samples: samples,
    };
  }

  function parseProfileJSON(profile) {
    // Thread 0 will always be the main thread of interest
    // TODO support all the thread in the profile
    var profileSamples = null;
    meta = profile.meta || {};
    if (params.appendVideoCapture) {
      meta.videoCapture = {
        src: params.appendVideoCapture,
      };
    }
    // Support older format that aren't thread aware
    var rootSymbol = null;
    var insertCommonRoot = false;
    var frameStart = {};
    meta.frameStart = frameStart;

    if (profile.threads != null) {
      for (var tid in profile.threads) {
         if (typeof profile.threads[tid] == "string") {
           profile.threads[tid] = JSON.parse(profile.threads[tid]);
           // If we parse the samples this may be a subprocess profile we need to merge in
           if (profile.threads[tid].threads != null) {
             var deltaTime = null;
             if (profile.meta.startTime && profile.threads[tid].meta.startTime) {
               deltaTime = profile.threads[tid].meta.startTime - profile.meta.startTime;
               for (var sampleId = 0; sampleId < profile.threads[tid].threads[0].samples; sampleId++) {
                 var sample = profile.threads[tid].threads[0].samples[sampleId];
                 if (sample.time) {
                   sample.time += deltaTime;
                 }
               }
             }
             profile.threads[tid] = profile.threads[tid].threads[0];
           }
         }
         var threadSamples = parseJSONSamples(profile.threads[tid].samples);
         if (tid == 0) {
           // TODO Remove 'samples' and use thread[0].samples for the main thread
           samples = threadSamples;
         }
         var defaultThreadName = (tid == 0) ? "Gecko Main Thread" : "NoName";
         threads[tid] = {
           name: profile.threads[tid].name || defaultThreadName,
           samples: threadSamples,
         };
      }
    } else {
      samples = parseJSONSamples(profile);
      threads[0] = {
        name: "Main",
        samples: samples,
      };
    }

    if (meta.timelines) {
      for(var i in meta.timelines) {
        var timeline = meta.timelines[i];
        var fakeThread = {};
        fakeThread.name = timeline.name;
        fakeThread.samples = [];

        function bytesToString(val) {
          if (val > 1024 * 1024 * 1024) {
            return Math.round(val / 1024 / 1024 / 1024) + " GB";
          } else {
            return Math.round(val / 1024 / 1024) + " MB";
          }
        }

        for (var id in threads[0].samples) {
          var sample = threads[0].samples[id];
          var time = sample.extraInfo.time;

          var reported = false;
          for (var sampleID in timeline.samples) {
            if (time < timeline.samples[sampleID].time && sampleID > 0) {
              var timelineSample = timeline.samples[sampleID-1];
              fakeThread.samples.push({
                frames: [ "Main", bytesToString(timelineSample.data) ],
                extraInfo: {
                  time: time,
                  height: timelineSample.data,
                },
              });
              reported = true;
              break;
            }
          }
          if (!reported) {
            fakeThread.samples.push({
              frames: [ "Main", "Unknown" ],
              extraInfo: {
                time: time,
                height: 0,
              },
            });
          }
        }
        threads["timeline"+i] = fakeThread;
        dump("Done timeline: " + timeline.name + "\n");
      }
    }

    function parseJSONSamples(profileSamples) {
      var samples = [];
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
          var pcIndex;
          if (frame.location !== undefined) {
            pcIndex = indexForSymbol(frame.location);
          } else {
            pcIndex = indexForSymbol(frame);
          }

          if (frame.lr !== undefined && shouldIncludeARMLRForPC(pcIndex)) {
            indicedFrames.push(indexForSymbol(frame.lr));
          }

          indicedFrames.push(pcIndex);
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
        if (sample.power) {
          sample.extraInfo["power"] = sample.power;
          meta.hasPowerInfo = true;
        }
        if (sample.marker) {
          sample.extraInfo["marker"] = sample.marker;
          prepareMarker(sample.extraInfo["marker"]);
        }
        if (sample.time) {
          sample.extraInfo["time"] = sample.time;
        }
        if (sample.frameNumber) {
          sample.extraInfo["frameNumber"] = sample.frameNumber;
          //dump("Got frame number: " + sample.frameNumber + "\n");
          frameStart[sample.frameNumber] = samples.length;
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
            sample.frames.unshift(rootIndex)
        }
      }
      return samples;
    }
  }

  var threadsDesc = {};

  for (var tid in threads) {
    var thread = threads[tid];
    threadsDesc[tid] = {
      name: thread.name,
    };
  }

  progressReporter.finish();
  // Don't increment the profile ID now because (1) it's buggy
  // and (2) for now there's no point in storing each profile
  // here if we're storing them in the local storage.
  //var profileID = gNextProfileID++;
  var profileID = gNextProfileID;
  gProfiles[profileID] = JSON.parse(JSON.stringify({
    meta: meta,
    symbols: symbols,
    functions: functions,
    resources: resources,
    threads: threads
  }));
  clearRegExpLastMatch();
  sendFinished(requestID, {
    meta: meta,
    numSamples: threads[0].samples.length,
    profileID: profileID,
    symbols: symbols,
    functions: functions,
    resources: resources,
    threadsDesc: threadsDesc,
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
      symbolicationTable[functionIndex] = f.symbol;
    }
  }
  // Currently if you request to save the current selection only the main thread will be saved.
  // Change the profileJSON value to handle the threads array.
  var DEFAULT_SAVE_THREAD = 0;
  var serializedProfile = JSON.stringify({
    format: "profileJSONWithSymbolicationTable,1",
    meta: profile.meta,
    profileJSON: complete ? { threads: profile.threads } : profile.filteredThreadSamples[DEFAULT_SAVE_THREAD],
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
  function areSamplesMultiroot(samples) {
    var previousRoot;
    for (var i = 0; i < samples.length; ++i) {
      if (!previousRoot) {
        previousRoot = samples[i].frames[0];
        continue;
      }
      if (previousRoot != samples[i].frames[0]) {
        return true;
      }
    }
    return false;
  }
  samples = samples.filter(function noNullSamples(sample) {
    return sample != null;
  });
  if (samples.length == 0)
    return new TreeNode("(empty)", null, 0);
  var firstRoot = null;
  for (var i = 0; i < samples.length; ++i) {
    firstRoot = samples[i].frames[0];
    break;
  }
  if (firstRoot == null) {
    return new TreeNode("(all filtered)", null, 0);
  }
  var multiRoot = areSamplesMultiroot(samples);
  var treeRoot = new TreeNode((isReverse || multiRoot) ? "(total)" : firstRoot, null, 0);
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

function filterByCallstackPrefix(samples, symbols, functions, callstack, appliesToJS, useFunctions) {
  var isJSFrameOrRoot = useFunctions ? function isJSFunctionOrRoot(functionIndex) {
      return (functionIndex in functions) && (functions[functionIndex].isJSFrame || functions[functionIndex].isRoot);
    } : function isJSSymbolOrRoot(symbolIndex) {
      return (symbolIndex in symbols) && (symbols[symbolIndex].isJSFrame || symbols[symbolIndex].isRoot);
    };
  return samples.map(function filterSample(sample) {
    if (!sample)
      return null;
    if (sample.frames.length < callstack.length)
      return null;
    for (var i = 0, j = 0; j < callstack.length; i++) {
      if (i >= sample.frames.length)
        return null;
      if (appliesToJS && !isJSFrameOrRoot(sample.frames[i]))
        continue;
      if (sample.frames[i] != callstack[j])
        return null;
      j++;
    }
    return makeSample(sample.frames.slice(i - 1), sample.extraInfo);
  });
}

function filterByCallstackPostfix(samples, symbols, functions, callstack, appliesToJS, useFunctions) {
  var isJSFrameOrRoot = useFunctions ? function isJSFunctionOrRoot(functionIndex) {
      return (functionIndex in functions) && (functions[functionIndex].isJSFrame || functions[functionIndex].isRoot);
    } : function isJSSymbolOrRoot(symbolIndex) {
      return (symbolIndex in symbols) && (symbols[symbolIndex].isJSFrame || symbols[symbolIndex].isRoot);
    };
  return samples.map(function filterSample(sample) {
    if (!sample)
      return null;
    if (sample.frames.length < callstack.length)
      return null;
    for (var i = 0, j = 0; j < callstack.length; i++) {
      if (i >= sample.frames.length)
        return null;
      if (appliesToJS && !isJSFrameOrRoot(sample.frames[sample.frames.length - i - 1]))
        continue;
      if (sample.frames[sample.frames.length - i - 1] != callstack[j])
        return null;
      j++;
    }
    var newFrames = sample.frames.slice(0, sample.frames.length - i + 1);
    return makeSample(newFrames, sample.extraInfo);
  });
}

function chargeNonJSToCallers(samples, symbols, functions, useFunctions) {
  var isJSFrameOrRoot = useFunctions ? function isJSFunctionOrRoot(functionIndex) {
      return (functionIndex in functions) && (functions[functionIndex].isJSFrame || functions[functionIndex].isRoot);
    } : function isJSSymbolOrRoot(symbolIndex) {
      return (symbolIndex in symbols) && (symbols[symbolIndex].isJSFrame || symbols[symbolIndex].isRoot);
    };
  samples = samples.slice(0);
  for (var i = 0; i < samples.length; ++i) {
    var sample = samples[i];
    if (!sample)
      continue;
    var newFrames = sample.frames.filter(isJSFrameOrRoot);
    if (!newFrames.length) {
      samples[i] = null;
    } else {
      samples[i].frames = newFrames;
    }
  }
  return samples;
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
  filter: function FocusedFrameSampleFilter_filter(samples, symbols, functions, useFunctions) {
    return filterBySymbol(samples, this._focusedSymbol);
  }
};

function FocusedCallstackPrefixSampleFilter(focusedCallstack, appliesToJS) {
  this._focusedCallstackPrefix = focusedCallstack;
  this._appliesToJS = appliesToJS;
}
FocusedCallstackPrefixSampleFilter.prototype = {
  filter: function FocusedCallstackPrefixSampleFilter_filter(samples, symbols, functions, useFunctions) {
    return filterByCallstackPrefix(samples, symbols, functions, this._focusedCallstackPrefix, this._appliesToJS, useFunctions);
  }
};

function FocusedCallstackPostfixSampleFilter(focusedCallstack, appliesToJS) {
  this._focusedCallstackPostfix = focusedCallstack;
  this._appliesToJS = appliesToJS;
}
FocusedCallstackPostfixSampleFilter.prototype = {
  filter: function FocusedCallstackPostfixSampleFilter_filter(samples, symbols, functions, useFunctions) {
    return filterByCallstackPostfix(samples, symbols, functions, this._focusedCallstackPostfix, this._appliesToJS, useFunctions);
  }
};

function RangeSampleFilter(start, end) {
  this._start = start;
  this._end = end;
}
RangeSampleFilter.prototype = {
  filter: function RangeSampleFilter_filter(samples, symbols, functions) {
    return samples.filter(function (sample) {
      return sample && sample.extraInfo.time >= this._start && sample.extraInfo.time <= this._end;
    }.bind(this));
  }
}

function unserializeSampleFilters(filters) {
  return filters.map(function (filter) {
    switch (filter.type) {
      case "FocusedFrameSampleFilter":
        return new FocusedFrameSampleFilter(filter.focusedSymbol);
      case "FocusedCallstackPrefixSampleFilter":
        return new FocusedCallstackPrefixSampleFilter(filter.focusedCallstack, filter.appliesToJS);
      case "FocusedCallstackPostfixSampleFilter":
        return new FocusedCallstackPostfixSampleFilter(filter.focusedCallstack, filter.appliesToJS);
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

function updateFilters(requestID, profileID, filters, threadId) {
  var threadId = threadId || 0;
  var profile = gProfiles[profileID];
  var samples = profile.threads[threadId].samples;
  var symbols = profile.symbols;
  var functions = profile.functions;

  if (filters.mergeFunctions) {
    samples = discardLineLevelInformation(samples, symbols, functions);
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
    return currentFilter.filter(filteredSamples, symbols, functions, filters.mergeFunctions);
  }, samples);
  if (filters.jankOnly) {
    samples = filterByJank(samples, gJankThreshold);
  }
  if (filters.javascriptOnly) {
    samples = chargeNonJSToCallers(samples, symbols, functions, filters.mergeFunctions);
  }

  gProfiles[profileID].filterSettings = filters;
  if (gProfiles[profileID].filteredThreadSamples == null) {
    gProfiles[profileID].filteredThreadSamples = {};
  }
  gProfiles[profileID].filteredThreadSamples[threadId] = samples;
  gProfiles[profileID].selectedThread = threadId;
  sendFinishedInChunks(requestID, samples, 40000,
                       function (sample) { return sample ? sample.frames.length : 1; });
}

function updateViewOptions(requestID, profileID, options, threadId) {
  var profile = gProfiles[profileID];
  var samples = profile.filteredThreadSamples[threadId];
  var symbols = profile.symbols;
  var functions = profile.functions;

  var treeData = convertToCallTree(samples, options.invertCallstack);
  if (options.mergeUnbranched)
    mergeUnbranchedCallPaths(treeData);
  sendFinished(requestID, treeData);
}

function findTimelineStart(profileID) {
  var profile = gProfiles[profileID];
  var min = null;
  for (var threadID in profile.filteredThreadSamples) {
    var thread = profile.filteredThreadSamples[threadID];
    if (thread == null)
      continue;
    if (thread[0].extraInfo.time && 
        (min == null || thread[0].extraInfo.time < min)) {
      min = thread[0].extraInfo.time;
    }
  }

  if (min == null) {
    dump("Bad min\n");
  }
  return min;
}

function findTimelineEnd(profileID) {
  var profile = gProfiles[profileID];
  var max = null;
  for (var threadID in profile.filteredThreadSamples) {
    var thread = profile.filteredThreadSamples[threadID];
    if (thread == null)
      continue;
    var len = thread.length;
    if (thread[len-2].extraInfo.time && 
        (max == null || thread[len-2].extraInfo.time > max)) {
      max = thread[len-2].extraInfo.time;
    }
  }

  if (max == null) {
    dump("Bad max\n");
  }
  return max;
}

// The responsiveness threshold (in ms) after which the sample should become
// completely red in the histogram.
var kDelayUntilWorstResponsiveness = 1000;

function getHistogramBoundaries(requestID, profileID, showMissedSample) {
  function flatten(arr) {
    return arr.reduce(function(a, b) { return a.concat(b) });
  }

  var samples = gProfiles[profileID].filteredThreadSamples;
  var times = flatten(Object.keys(samples).map(function (id) {
    return Object.keys(samples[id]).map(function (stepId) {
      if (!samples[id][stepId]) {
        return Number.NaN;
      }
      return Math.floor(samples[id][stepId].extraInfo.time);
    });
  }));

  // Filter out all entries with no time.
  times = times.filter(function (time) { return !isNaN(time); });

  sendFinished(requestID, {
    minima: Math.min.apply(null, times),
    maxima: Math.max.apply(null, times)
  });
}

function calculateHistogramData(requestID, profileID, showMissedSample, options, threadId) {
  function getStepColor(step) {
    var res;

    if (options.showPowerInfo) {
      res = step.extraInfo.power;
      return Math.round(255 * Math.min(1, res / options.peakPower));
    } else if (step.extraInfo && "responsiveness" in step.extraInfo) {
      res = step.extraInfo.responsiveness;
      return Math.round(255 * Math.min(1, res / kDelayUntilWorstResponsiveness));
    }

    return 0;
  }

  function getHeight(step) {
    if (!step) {
      return 0;
    }
    return step.extraInfo.height || step.frames.length;
  }

  function getMovingHeight(prevStep, step) {
    var nonMoving = 0;
    if (prevStep) {
      var len = Math.min(prevStep.frames.length, step.frames.length);
      for (var i = 0; i < len; i++) {
        if (prevStep.frames[i] == step.frames[i]) {
           nonMoving++;
        }
      }
    }
    return step.frames.length - nonMoving;
  }

  function symbolicateMarkers(markers) {
    var symMarkers = [];
    for (var i = 0; i < markers.length; i++) {
      var marker = JSON.parse(JSON.stringify(markers[i]));
      if (marker.data && marker.data.stack) {
        marker.data.stack = prepareSample(marker.data.stack, profile.symbols);
      }
      symMarkers.push(marker);
    }
    return symMarkers;
  }

  var profile = gProfiles[profileID];
  var data = profile.filteredThreadSamples[threadId];
  var maxHeight = data.reduce(function (prev, curr, i, a) {
    curr = getHeight(curr);
    return curr > prev ? curr : prev;
  }, 0) + 1;

  var prevStep = null;
  var histogram = data
    .filter(function (step) { return step != null; })
    .map(function (step, i) {
      var movingHeight = getMovingHeight(prevStep, step);
      prevStep = step;
      return {
        frames: [ step.frames ],
        height: getHeight(step) / (maxHeight / 100),
        movingHeight: movingHeight / (maxHeight / 100),
        time: step.extraInfo.time,
        power: step.extraInfo.power,
        markers: symbolicateMarkers(step.extraInfo.marker || []),
        color: getStepColor(step)
      };
    });

  sendFinished(requestID, { threadId: threadId, histogramData: histogram });
}

var diagnosticList = [
  // *************** Known bugs first (highest priority)
  {
    image: "io.png",
    title: "Main Thread IO - Bug 765135 - TISCreateInputSourceList",
    check: function(frames, symbols, meta) {

      if (!stepContains('TISCreateInputSourceList', frames, symbols))
        return false;

      return stepContains('__getdirentries64', frames, symbols) 
          || stepContains('__read', frames, symbols) 
          || stepContains('__open', frames, symbols) 
          || stepContains('__unlink', frames, symbols) 
          || stepEquals('read', frames, symbols) 
          || stepEquals('write', frames, symbols) 
          || stepEquals('fsync', frames, symbols) 
          || stepContains('stat$INODE64', frames, symbols)
          ;
    },
  },

  {
    image: "js.png",
    title: "Bug 772916 - Gradients are slow on mobile",
    bugNumber: "772916",
    check: function(frames, symbols, meta) {

      return stepContains('PaintGradient', frames, symbols)
          && stepContains('BasicTiledLayerBuffer::PaintThebesSingleBufferDraw', frames, symbols)
          ;
    },
  },
  {
    image: "cache.png",
    title: "Bug 717761 - Main thread can be blocked by IO on the cache thread",
    bugNumber: "717761",
    check: function(frames, symbols, meta) {

      return stepContains('nsCacheEntryDescriptor::GetStoragePolicy', frames, symbols)
          ;
    },
  },
  {
    image: "js.png",
    title: "Web Content Shutdown Notification",
    check: function(frames, symbols, meta) {

      return stepContains('nsAppStartup::Quit', frames, symbols)
          && stepContains('nsDocShell::FirePageHideNotification', frames, symbols)
          ;
    },
  },
  {
    image: "js.png",
    title: "Bug 789193 - AMI_startup() takes 200ms on startup",
    bugNumber: "789193",
    check: function(frames, symbols, meta) {

      return stepContains('AMI_startup()', frames, symbols)
          ;
    },
  },
  {
    image: "js.png",
    title: "Bug 818296 - [Shutdown] js::NukeCrossCompartmentWrappers takes up 300ms on shutdown",
    bugNumber: "818296",
    check: function(frames, symbols, meta) {
      return stepContains('js::NukeCrossCompartmentWrappers', frames, symbols)
          && (stepContains('WindowDestroyedEvent', frames, symbols) || stepContains('DoShutdown', frames, symbols))
          ;
    },
  },
  {
    image: "js.png",
    title: "Bug 818274 - [Shutdown] Telemetry takes ~10ms on shutdown",
    bugNumber: "818274",
    check: function(frames, symbols, meta) {
      return stepContains('TelemetryPing.js', frames, symbols)
          ;
    },
  },
  {
    image: "plugin.png",
    title: "Bug 818265 - [Shutdown] Plug-in shutdown takes ~90ms on shutdown",
    bugNumber: "818265",
    check: function(frames, symbols, meta) {
      return stepContains('PluginInstanceParent::Destroy', frames, symbols)
          ;
    },
  },
  {
    image: "snapshot.png",
    title: "Bug 720575 - Make thumbnailing faster and/or asynchronous",
    bugNumber: "720575",
    check: function(frames, symbols, meta) {
      return stepContains('Thumbnails_capture()', frames, symbols)
          ;
    },
  },

  {
    image: "js.png",
    title: "Bug 789185 - LoginManagerStorage_mozStorage.init() takes 300ms on startup ",
    bugNumber: "789185",
    check: function(frames, symbols, meta) {

      return stepContains('LoginManagerStorage_mozStorage.prototype.init()', frames, symbols)
          ;
    },
  },

  {
    image: "js.png",
    title: "JS - Bug 767070 - Text selection performance is bad on android",
    bugNumber: "767070",
    check: function(frames, symbols, meta) {

      if (!stepContains('FlushPendingNotifications', frames, symbols))
        return false;

      return stepContains('sh_', frames, symbols)
          && stepContains('browser.js', frames, symbols)
          ;
    },
  },

  {
    image: "js.png",
    title: "JS - Bug 765930 - Reader Mode: Optimize readability check",
    bugNumber: "765930",
    check: function(frames, symbols, meta) {

      return stepContains('Readability.js', frames, symbols)
          ;
    },
  },

  // **************** General issues
  {
    image: "js.png",
    title: "JS is triggering a sync reflow",
    check: function(frames, symbols, meta) {
      return symbolSequence(['js::RunScript','layout::DoReflow'], frames, symbols) ||
             symbolSequence(['js::RunScript','layout::Flush'], frames, symbols)
          ;
    },
  },

  {
    image: "gc.png",
    title: "Garbage Collection Slice",
    canMergeWithGC: false,
    check: function(frames, symbols, meta, step) {
      var slice = findGCSlice(frames, symbols, meta, step);

      if (slice) {
        var gcEvent = findGCEvent(frames, symbols, meta, step);
        //dump("found event matching diagnostic\n");
        //dump(JSON.stringify(gcEvent) + "\n");
        return true;
      }
      return false;
    },
    details: function(frames, symbols, meta, step) {
      var slice = findGCSlice(frames, symbols, meta, step);
      if (slice) {
        return "" +
          "Reason: " + slice.reason + "\n" +
          "Slice: " + slice.slice + "\n" +
          "Pause: " + slice.pause + " ms";
      }
      return null;
    },
    onclickDetails: function(frames, symbols, meta, step) {
      var gcEvent = findGCEvent(frames, symbols, meta, step);
      if (gcEvent) {
        return JSON.stringify(gcEvent);
      } else {
        return null;
      }
    },
  },
  {
    image: "cc.png",
    title: "Cycle Collect",
    check: function(frames, symbols, meta, step) {
      var ccEvent = findCCEvent(frames, symbols, meta, step);

      if (ccEvent) {
        return true;
      }
      return false;
    },
    details: function(frames, symbols, meta, step) {
      var ccEvent = findCCEvent(frames, symbols, meta, step);
      if (ccEvent) {
        return "" +
          "Duration: " + ccEvent.duration + " ms\n" +
          "Suspected: " + ccEvent.suspected;
      }
      return null;
    },
    onclickDetails: function(frames, symbols, meta, step) {
      var ccEvent = findCCEvent(frames, symbols, meta, step);
      if (ccEvent) {
        return JSON.stringify(ccEvent);
      } else {
        return null;
      }
    },
  },
  {
    image: "gc.png",
    title: "Garbage Collection",
    canMergeWithGC: false,
    check: function(frames, symbols, meta) {
      return stepContainsRegEx(/.*Collect.*Runtime.*Invocation.*/, frames, symbols)
          || stepContains('GarbageCollectNow', frames, symbols) // Label
          || stepContains('JS_GC(', frames, symbols) // Label
          || stepContains('CycleCollect__', frames, symbols) // Label
          ;
    },
  },
  {
    image: "cc.png",
    title: "Cycle Collect",
    check: function(frames, symbols, meta) {
      return stepContains('nsCycleCollector::Collect', frames, symbols)
          || stepContains('CC:CycleCollectNow', frames, symbols) // Label
          || stepContains('CycleCollect__', frames, symbols) // Label
          || stepContains('nsCycleCollectorRunner::Collect', frames, symbols) // Label
          ;
    },
  },
  {
    image: "plugin.png",
    title: "Sync Plugin Constructor",
    check: function(frames, symbols, meta) {
      return stepContains('CallPPluginInstanceConstructor', frames, symbols) 
          || stepContains('CallPCrashReporterConstructor', frames, symbols) 
          || stepContains('PPluginModuleParent::CallNP_Initialize', frames, symbols)
          || stepContains('GeckoChildProcessHost::SyncLaunch', frames, symbols)
          ;
    },
  },
  {
    image: "text.png",
    title: "Font Loading",
    check: function(frames, symbols, meta) {
      return stepContains('gfxFontGroup::BuildFontList', frames, symbols);
    },
  },
  {
    image: "io.png",
    title: "Main Thread IO!",
    check: function(frames, symbols, meta) {
      return stepContains('__getdirentries64', frames, symbols) 
          || stepContains('__open', frames, symbols) 

          // Window IO Functions
          || stepContains('NtClose', frames, symbols) 
          || stepContains('NtFlushBuffersFile', frames, symbols) 
          || stepContains('NtSetInformationFile', frames, symbols) 
          || stepContains('NtWriteFile', frames, symbols) 
          || stepContains('ZwCreateFile', frames, symbols) 
          || stepContains('ZwQueryFullAttributesFile', frames, symbols) 

          || stepContains('storage:::Statement::ExecuteStep', frames, symbols) 
          || stepContains('__unlink', frames, symbols) 
          || stepContains('fsync', frames, symbols) 
          || stepContains('stat$INODE64', frames, symbols)
          || stepEquals('read', frames, symbols) 
          || stepEquals('write', frames, symbols) 
          || stepEquals('fsync', frames, symbols) 
          ;
    },
  },
];

function hasJSFrame(frames, symbols) {
  for (var i = 0; i < frames.length; i++) {
    if (symbols[frames[i]].isJSFrame === true) {
      return true;
    }
  }
  return false;
}
function findCCEvent(frames, symbols, meta, step) {
  if (!step || !step.extraInfo || !step.extraInfo.time || !meta || !meta.gcStats)
    return null;

  var time = step.extraInfo.time;

  for (var i = 0; i < meta.gcStats.ccEvents.length; i++) {
    var ccEvent = meta.gcStats.ccEvents[i];
    if (ccEvent.start_timestamp <= time && ccEvent.end_timestamp >= time) {
      //dump("JSON: " + js_beautify(JSON.stringify(ccEvent)) + "\n");
      return ccEvent;
    }
  }

  return null;
}
function findGCEvent(frames, symbols, meta, step) {
  if (!step || !step.extraInfo || !step.extraInfo.time || !meta || !meta.gcStats)
    return null;

  var time = step.extraInfo.time;

  for (var i = 0; i < meta.gcStats.gcEvents.length; i++) {
    var gcEvent = meta.gcStats.gcEvents[i];
    if (!gcEvent.slices)
      continue;
    for (var j = 0; j < gcEvent.slices.length; j++) {
      var slice = gcEvent.slices[j];
      if (slice.start_timestamp <= time && slice.end_timestamp >= time) {
        return gcEvent;
      }
    }
  }

  return null;
}
function findGCSlice(frames, symbols, meta, step) {
  if (!step || !step.extraInfo || !step.extraInfo.time || !meta || !meta.gcStats)
    return null;

  var time = step.extraInfo.time;

  for (var i = 0; i < meta.gcStats.gcEvents.length; i++) {
    var gcEvent = meta.gcStats.gcEvents[i];
    if (!gcEvent.slices)
      continue;
    for (var j = 0; j < gcEvent.slices.length; j++) {
      var slice = gcEvent.slices[j];
      if (slice.start_timestamp <= time && slice.end_timestamp >= time) {
        return slice;
      }
    }
  }

  return null;
}
function stepEquals(string, frames, symbols) {
  for (var i = 0; frames && i < frames.length; i++) {
    if (!(frames[i] in symbols))
      continue;
    var frameSym = symbols[frames[i]].functionName || symbols[frames[i]].symbolName;
    if (frameSym == string) {
      return true;
    }
  }
  return false;
}
function stepContains(substring, frames, symbols) {
  for (var i = 0; frames && i < frames.length; i++) {
    if (!(frames[i] in symbols))
      continue;
    var frameSym = symbols[frames[i]].functionName || symbols[frames[i]].symbolName;
    if (frameSym.indexOf(substring) != -1) {
      return true;
    }
  }
  return false;
}
function stepContainsRegEx(regex, frames, symbols) {
  for (var i = 0; frames && i < frames.length; i++) {
    if (!(frames[i] in symbols))
      continue;
    var frameSym = symbols[frames[i]].functionName || symbols[frames[i]].symbolName;
    if (regex.exec(frameSym)) {
      return true;
    }
  }
  return false;
}
function symbolSequence(symbolsOrder, frames, symbols) {
  var symbolIndex = 0;
  for (var i = 0; frames && i < frames.length; i++) {
    if (!(frames[i] in symbols))
      continue;
    var frameSym = symbols[frames[i]].functionName || symbols[frames[i]].symbolName;
    var substring = symbolsOrder[symbolIndex];
    if (frameSym.indexOf(substring) != -1) {
      symbolIndex++;
      if (symbolIndex == symbolsOrder.length) {
        return true;
      }
    }
  }
  return false;
}
function firstMatch(array, matchFunction) {
  for (var i = 0; i < array.length; i++) {
    if (matchFunction(array[i]))
      return array[i];
  }
  return undefined;
}

function prepareSample(frames, symbols) {
  var stack = [];
  for (var i = 0; i < frames.length; i++) {
    var sym = symbols[frames[i]].functionName || symbols[frames[i]].symbolName;
    if (sym.indexOf("mozilla_sampler_tracing(") == 0) {
      break;
    }
    stack.push(sym);
  }
  return stack;
}

function calculateWaterfallData(requestID, profileID, boundaries) {
  var profile = gProfiles[profileID];
  var symbols = profile.functions;

  var mainThread = null;
  var compThread = null;
  for (var threadId in profile.threads) {
    var thread = profile.threads[threadId];
    if (thread.name &&
       (thread.name.lastIndexOf("Gecko") == 0 ||
        thread.name.lastIndexOf("GeckoMain") == 0)) {
      mainThread = thread.samples;
    } else if (thread.name &&
        thread.name.lastIndexOf("Compositor") == 0) {
      compThread = thread.samples;
    }
  }

  if (!mainThread || !compThread ||
      boundaries.min == -Infinity || boundaries.min == Infinity ||
      boundaries.max == -Infinity || boundaries.max == Infinity) {
    sendFinished(requestID, null);
    return null;
  }

  function getPaintMarkers(sample) {
    if (sample.extraInfo == null ||
        sample.extraInfo.marker == null)
      return [];

    var markers = [];
    for (var i = 0; i < sample.extraInfo.marker.length; i++) {
      if (sample.extraInfo.marker[i].data &&
          sample.extraInfo.marker[i].data.category == "Paint") {
        markers.push(sample.extraInfo.marker[i]);
      }
    }
    return markers;
  }
  
  var result = {
    boundaries: boundaries,
    items: [],
  };
  var mainThreadState = "Waiting";
  var mainThreadPos = 0;
  var compThreadState = "Waiting";
  var compThreadPos = 0;
  var time = boundaries.minima;
  var startScripts = null;
  var endScripts = null;
  var startRasterize = null;
  var startComposite = null;
  var startTimerStack = null;
  while (true) {
    while (mainThreadPos < mainThread.length &&
        (mainThread[mainThreadPos].extraInfo.time == null ||
         time > mainThread[mainThreadPos].extraInfo.time)) {
      mainThreadPos++;
    }
    while (compThreadPos < compThread.length &&
        (compThread[compThreadPos].extraInfo.time == null ||
         time > compThread[compThreadPos].extraInfo.time)) {
      compThreadPos++;
    }
    if (mainThreadPos >= mainThread.length &&
        compThreadPos >= compThread.length) {
      break;
    }

    var nextSample = null;
    if (mainThreadPos < mainThread.length &&
        (compThreadPos == compThread.length ||
         mainThread[mainThreadPos].extraInfo.time <= compThread[compThreadPos].extraInfo.time)) {
      nextSample = mainThread[mainThreadPos];
      mainThreadPos++;
      var paintMarkers = getPaintMarkers(nextSample);
      for (var i = 0; i < paintMarkers.length; i++) {
        var marker = paintMarkers[i];
        if (marker.name == "RD" && marker.data.interval == "start") {
          mainThreadState = "RDenter";
        } else if (marker.name == "RD" && marker.data.interval == "end") {
          mainThreadState = "Waiting";
        } else if (mainThreadState == "RDenter" &&
            marker.name == "Scripts" && marker.data.interval == "start") {
          startScripts = nextSample.extraInfo.time;
          endScripts = null;
        } else if (marker.name == "ReflowCause" && marker.data && marker.data.stack) {
          startTimerStack = prepareSample(marker.data.stack, profile.symbols);
        } else if (mainThreadState == "RDenter" &&
            startScripts &&
            marker.name == "Scripts" && marker.data.interval == "end") {
          result.items.push({
            startTime: startScripts,
            endTime: nextSample.extraInfo.time,
            text: "Scripts",
          });
          startScripts = null;
          endScripts = nextSample.extraInfo.time;
        } else if (mainThreadState == "RDenter" &&
            marker.name == "Rasterize" && marker.data.interval == "start") {
          startRasterize = nextSample.extraInfo.time;
          result.items.push({
            startTime: endScripts,
            endTime: nextSample.extraInfo.time,
            text: "Layout",
            startTimerStack: startTimerStack,
          });
          startTimerStack = null;
          endScripts = null;
        } else if (mainThreadState == "RDenter" &&
            startRasterize &&
            marker.name == "Rasterize" && marker.data.interval == "end") {
          result.items.push({
            startTime: startRasterize,
            endTime: nextSample.extraInfo.time,
            text: "Rasterize",
          });
          startRasterize = null;
        }
      }
    } else {
      nextSample = compThread[compThreadPos];
      compThreadPos++;
      var paintMarkers = getPaintMarkers(nextSample);
      for (var i = 0; i < paintMarkers.length; i++) {
        var marker = paintMarkers[i];
        if (marker.name == "Composite" && marker.data.interval == "start" &&
            !startComposite) {
          startComposite = nextSample.extraInfo.time;
        } else if (marker.name == "Composite" && marker.data.interval == "end") {
          if (mainThreadPos != 0 &&
              startComposite != null && startComposite != nextSample.extraInfo.time) {
            result.items.push({
              startTime: startComposite,
              endTime: nextSample.extraInfo.time,
              text: "Composite",
            });
          }
          startComposite = null;
        }
      }
    }
    
    time = nextSample.extraInfo.time;
  }
  

  sendFinished(requestID, result);
}

function calculateDiagnosticItems(requestID, profileID, meta, threadId) {
  var profile = gProfiles[profileID];
  var symbols = profile.functions;
  var data = profile.filteredThreadSamples[threadId];

  var lastStep = data[data.length-1];
  var widthSum = data.length;
  var pendingDiagnosticInfo = null;

  var diagnosticItems = [];

  function finishPendingDiagnostic(step, endX) {
    if (!pendingDiagnosticInfo)
      return;

    var diagnostic = pendingDiagnosticInfo.diagnostic;
    var currDiagnostic = {
      x: pendingDiagnosticInfo.x / widthSum,
      start: pendingDiagnosticInfo.start,
      end: step.extraInfo.time,
      width: (endX - pendingDiagnosticInfo.x) / widthSum,
      imageFile: pendingDiagnosticInfo.diagnostic.image,
      title: pendingDiagnosticInfo.diagnostic.title,
      details: pendingDiagnosticInfo.details,
      onclickDetails: pendingDiagnosticInfo.onclickDetails
    };

    if (!currDiagnostic.onclickDetails && diagnostic.bugNumber) {
      currDiagnostic.onclickDetails = "bug " + diagnostic.bugNumber;
    }

    diagnosticItems.push(currDiagnostic);

    pendingDiagnosticInfo = null;
  }

/*
  dump("meta: " + meta.gcStats + "\n");
  if (meta && meta.gcStats) {
    dump("GC Stats: " + JSON.stringify(meta.gcStats) + "\n");
  }
*/

  data.forEach(function diagnoseStep(step, x) {
    if (step) {
      var frames = step.frames;

      var diagnostic = firstMatch(diagnosticList, function (diagnostic) {
        return diagnostic.check(frames, symbols, meta, step);
      });
    }

    if (!diagnostic) {
      finishPendingDiagnostic(step, x);
      return;
    }

    var details = diagnostic.details ? diagnostic.details(frames, symbols, meta, step) : null;

    if (pendingDiagnosticInfo) {
      // We're already inside a diagnostic range.
      if (diagnostic == pendingDiagnosticInfo.diagnostic && pendingDiagnosticInfo.details == details) {
        // We're still inside the same diagnostic.
        return;
      }

      // We have left the old diagnostic and found a new one. Finish the old one.
      finishPendingDiagnostic(step, x);
    }

    pendingDiagnosticInfo = {
      diagnostic: diagnostic,
      x: x,
      start: step.extraInfo.time,
      details: details,
      onclickDetails: diagnostic.onclickDetails ? diagnostic.onclickDetails(frames, symbols, meta, step) : null
    };
  });
  if (pendingDiagnosticInfo)
    finishPendingDiagnostic(data[data.length-1], data.length);

  sendFinished(requestID, diagnosticItems);
}
