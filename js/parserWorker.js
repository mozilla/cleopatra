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
        calculateWaterfallData(requestID, taskData.profileID, taskData.boundaries, taskData.selectedThreadId);
        break;
      case "getLogData":
        getLogData(requestID, taskData.profileID, taskData.boundaries);
        break;
      case "calculateDiagnosticItems":
        calculateDiagnosticItems(requestID, taskData.profileID, taskData.meta, taskData.threadId);
        break;
      case "changeWorseResponsiveness":
        kDelayUntilWorstResponsiveness = taskData.res;
        break;
      case "addComment":
        addComment(requestID, taskData.profileID, taskData.threadId, taskData.time, taskData.comment);
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

function timeToIndex(data, time) {
  // Speed up using binary search if required, but make sure the first item
  // in case of equality.

  for (var i = 0; i < data.length - 1; i++) {
    if (data[i+1].time && Math.floor(data[i+1].time) > time) {
      return i;
    }
  }

  return data.length - 1;
}

function addComment(requestID, profileID, threadId, time, comment) {
  var thread = gProfiles[profileID].threads[threadId];
  thread.markers = thread.markers || [];
  var markers = thread.markers;
  var index = timeToIndex(markers, time);

  markers.splice(index, 0, {
    name: comment,
    type: 'comment',
    time: time
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
  var tasktracer = null;
  var armIncludePCIndex = {};

  if (rawProfile == null) {
    throw new Error("rawProfile is null");
  }

  if (typeof rawProfile == "string" && rawProfile[0] == "{") {
    // rawProfile is a JSON string.
    rawProfile = JSON.parse(rawProfile);
    if (rawProfile === null) {
      throw new Error("rawProfile couldn't not successfully be parsed using JSON.parse. Make sure that the profile is a valid JSON encoding.");
    }
  }

  if (rawProfile.profile) {
    rawProfile = rawProfile.profile;
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

  tasktracer = rawProfile.tasktracer;

  if (params.profileId) {
    meta.profileId = params.profileId;
  }

  function cleanFunctionName(functionName) {
    var ignoredPrefix = "non-virtual thunk to ";
    if (functionName.startsWith && functionName.startsWith(ignoredPrefix))
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
  function prepareMarkers(markerArray) {
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
        prepareMarkers(extraInfo.marker);
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

    // Inflate version 3 profiles, which are deduplicated, to version 2
    // profiles.
    if (profile.meta && profile.meta.version == 3) {
      inflateSchemaProfileThreads(profile);
    }

    // Support older format that aren't thread aware
    var rootSymbol = null;
    var insertCommonRoot = false;
    var frameStart = {};
    meta.frameStart = frameStart;

    if (profile.threads != null) {
      for (var tid in profile.threads) {
         if (typeof profile.threads[tid] == "string") {
           var subprocessThread = JSON.parse(profile.threads[tid]);
           if (profile.meta.version == 3) {
             inflateSchemaProfileThreads(subprocessThread);
           }
           profile.threads[tid] = subprocessThread;

           // If we parse the samples this may be a subprocess profile we need to merge in
           if (profile.threads[tid].threads != null) {
             var deltaTime = null;
             if (profile.meta.startTime && profile.threads[tid].meta.startTime) {
               deltaTime = profile.threads[tid].meta.startTime - profile.meta.startTime;
               for (var sampleId = 0; sampleId < profile.threads[tid].threads[0].samples.length; sampleId++) {
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
         // If we are using a recent profile there is a separate markers array
         // We don't need to do anything interesting with it, just pass it on
         var markers = profile.threads[tid].markers || [];
         // If there is no separate markers array, we are in legacy mode, so
         // we need to find the markers inside the thread samples and pull them out into
         // a separate array
         markers = markers.concat(parseOldJSONMarkers(profile.threads[tid].samples));
         var defaultThreadName = (tid == 0) ? "Gecko Main Thread" : "NoName";

         prepareMarkers(markers);

         threads[tid] = {
           name: profile.threads[tid].name || defaultThreadName,
           samples: threadSamples,
           markers: markers,
         };
      }
    } else {
      samples = parseJSONSamples(profile);
      threads[0] = {
        name: "Main",
        samples: samples,
        markers: parseOldJSONMarkers(profile),
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
      }
    }

    //TODO: test with REALLY old profiles
    // in the old formats the markers are in the same array as the samples
    function parseOldJSONMarkers(profileSamples) {
      var markers = [];
      if (!profileSamples) return markers;
      for (var i = 0; i < profileSamples.length; i++) {
        var sample = profileSamples[i];
        if (!sample) {
          // This sample was filtered before saving
          continue;
        }
        // there's a list of markers per sample
        var markersInSample = sample.marker;
        if (markersInSample) {
          // this function must be called exactly once on each list of markers in a sample
          // sample.marker is actually an array and this function manipulates each marker inside
          prepareMarkers(markersInSample);
          for (var j = 0; j < markersInSample.length; j++) {
            var marker = markersInSample[j];
            marker.time = sample.extraInfo.time;
            markers.push(marker);
          }
        }
        // parsing markers is the second half
        progressReporter.setProgress((i + 1) / profileSamples.length / 2 + 0.5);
      }

      return markers;
    }
    function parseJSONSamples(profileSamples) {
      var samples = [];
      for (var j = 0; j < profileSamples.length; j++) {
        var sample = profileSamples[j];
        var indicedFrames = [];
        if (!sample) {
          // This sample was filtered before saving
          samples.push(null);
          // parsing samples is the first half
          progressReporter.setProgress((j + 1) / profileSamples.length / 2);
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
        if (sample.time) {
          sample.extraInfo["time"] = sample.time;
        }
        if (sample.frameNumber) {
          sample.extraInfo["frameNumber"] = sample.frameNumber;
        }
        if (sample.extraInfo["frameNumber"]) {
          frameStart[sample.extraInfo["frameNumber"]%256] = sample.extraInfo["time"];
        }
        samples.push(makeSample(indicedFrames, sample.extraInfo));
        // parsing samples is the first half
        progressReporter.setProgress((j + 1) / profileSamples.length / 2);
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

  if (threads[0] == null) {
    throw new Error("No threads in the profile. Make sure that you specified valid thread names when profiling." + threads);
    return;
  }

  // Don't increment the profile ID now because (1) it's buggy
  // and (2) for now there's no point in storing each profile
  // here if we're storing them in the local storage.
  //var profileID = gNextProfileID++;
  var profileID = gNextProfileID;
  gProfiles[profileID] = JSON.parse(JSON.stringify({
    meta: meta,
    tasktracer: tasktracer,
    symbols: symbols,
    functions: functions,
    resources: resources,
    threads: threads
  }));
  clearRegExpLastMatch();
  sendFinished(requestID, {
    meta: meta,
    tasktracer: tasktracer,
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
    tasktracer: profile.tasktracer,
    profileJSON: complete ? { threads: profile.threads } : profile.filteredThreadSamples[DEFAULT_SAVE_THREAD],
    symbolicationTable: symbolicationTable
  });
  sendFinished(requestID, serializedProfile);
}

function inflateSchemaProfileThreads(profile) {
  function maybeTableEntry(table, index) {
    return index == undefined ? undefined : table[index];
  }

  function inflateOptimizations(optimizations, stringTable) {
    if (optimizations == undefined) {
      return undefined;
    }

    var types = optimizations.types;
    var inflatedTypes = new Array(types.length);

    for (var i = 0; i < types.length; i++) {
      var type = types[i];

      var typeset = type.typeset;
      var inflatedTypeset;

      if (typeset) {
        inflatedTypeset = new Array(typeset.length);
        for (var j = 0; j < typeset.length; j++) {
          var ti = typeset[j];
          inflatedTypeset[j] = {
            keyedBy: maybeTableEntry(stringTable, ti.keyedBy),
            name: maybeTableEntry(stringTable, ti.name),
            location: maybeTableEntry(stringTable, ti.location),
            line: ti.line
          };
        }
      }

      inflatedTypes[i] = {
        typeset: inflatedTypeset,
        site: stringTable[type.site],
        mirType: stringTable[type.mirType]
      };
    }

    var attempts = optimizations.attempts;
    var attemptsData = attempts.data;
    var inflatedAttempts = new Array(attemptsData.length);

    var ATTEMPT_STRATEGY_SLOT = attempts.schema.strategy;
    var ATTEMPT_OUTCOME_SLOT = attempts.schema.outcome;

    for (var i = 0; i < attemptsData.length; i++) {
      var attempt = attemptsData[i];
      inflatedAttempts[i] = {
        strategy: stringTable[attempt[ATTEMPT_STRATEGY_SLOT]],
        outcome: stringTable[attempt[ATTEMPT_OUTCOME_SLOT]]
      };
    }

    return {
      types: inflatedTypes,
      attempts: inflatedAttempts,
      propertyName: maybeTableEntry(stringTable, optimizations.propertyName),
      line: optimizations.line,
      column: optimizations.column
    };
  }

  function inflateSamples(samples, stackTable, frameTable, stringTable, inflatedFramesCache) {
    var SAMPLE_STACK_SLOT = samples.schema.stack;
    var SAMPLE_TIME_SLOT = samples.schema.time;
    var SAMPLE_RESPONSIVENESS_SLOT = samples.schema.responsiveness;
    var SAMPLE_RSS_SLOT = samples.schema.rss;
    var SAMPLE_USS_SLOT = samples.schema.uss;
    var SAMPLE_FRAMENUMBER_SLOT = samples.schema.frameNumber;
    var SAMPLE_POWER_SLOT = samples.schema.power;

    var STACK_PREFIX_SLOT = stackTable.schema.prefix;
    var STACK_FRAME_SLOT = stackTable.schema.frame;

    var FRAME_LOCATION_SLOT = frameTable.schema.location;
    var FRAME_IMPLEMENTATION_SLOT = frameTable.schema.implementation;
    var FRAME_OPTIMIZATIONS_SLOT = frameTable.schema.optimizations;
    var FRAME_LINE_SLOT = frameTable.schema.line;
    var FRAME_CATEGORY_SLOT = frameTable.schema.category;

    var samplesData = samples.data;
    var stacksData = stackTable.data;
    var framesData = frameTable.data;
    var inflatedSamples = new Array(samplesData.length);

    for (var i = 0; i < samplesData.length; i++) {
      var sample = samplesData[i];

      var frames = [];
      var stackIndex = sample[SAMPLE_STACK_SLOT];
      while (stackIndex !== null) {
        var stackEntry = stacksData[stackIndex];
        var frameIndex = stackEntry[STACK_FRAME_SLOT];
        var f = inflatedFramesCache[frameIndex];
        if (!f) {
          var frame = framesData[frameIndex];
          f = inflatedFramesCache[frameIndex] = {
            location: stringTable[frame[FRAME_LOCATION_SLOT]],
            implementation: maybeTableEntry(stringTable, frame[FRAME_IMPLEMENTATION_SLOT]),
            optimizations: inflateOptimizations(frame[FRAME_OPTIMIZATIONS_SLOT], stringTable),
            line: frame[FRAME_LINE_SLOT],
            category: frame[FRAME_CATEGORY_SLOT]
          };
        }
        frames.push(f);
        stackIndex = stackEntry[STACK_PREFIX_SLOT];
      }

      // Reverse to get oldest-to-youngest order.
      frames.reverse();

      inflatedSamples[i] = {
        frames: frames,
        time: sample[SAMPLE_TIME_SLOT],
        responsiveness: sample[SAMPLE_RESPONSIVENESS_SLOT],
        rss: sample[SAMPLE_RSS_SLOT],
        uss: sample[SAMPLE_USS_SLOT],
        frameNumber: sample[SAMPLE_FRAMENUMBER_SLOT],
        power: sample[SAMPLE_POWER_SLOT]
      };
    }

    return inflatedSamples;
  }

  function inflateMarkers(markers, stackTable, frameTable, stringTable, inflatedFramesCache) {
    var MARKER_NAME_SLOT = markers.schema.name;
    var MARKER_TIME_SLOT = markers.schema.time;
    var MARKER_DATA_SLOT = markers.schema.data;

    var markersData = markers.data;
    var inflatedMarkers = new Array(markersData.length);

    for (var i = 0; i < markersData.length; i++) {
      var marker = markersData[i];

      var payload = marker[MARKER_DATA_SLOT];
      if (payload && payload.type === "tracing" && payload.stack) {
        payload.stack = inflateThread(payload.stack, stackTable, frameTable, stringTable,
                                      inflatedFramesCache);
      }

      inflatedMarkers[i] = {
        name: stringTable[marker[MARKER_NAME_SLOT]],
        time: marker[MARKER_TIME_SLOT],
        data: payload
      };
    }

    return inflatedMarkers;
  }

  function inflateThread(thread, stackTable, frameTable, stringTable, inflatedFramesCache) {
    return {
      name: thread.name,
      tid: thread.tid,
      samples: inflateSamples(thread.samples, stackTable, frameTable, stringTable,
                              inflatedFramesCache),
      markers: inflateMarkers(thread.markers, stackTable, frameTable, stringTable,
                              inflatedFramesCache)
    };
  }

  if (profile.meta.version !== 3) {
    return;
  }

  for (var i = 0; i < profile.threads.length; i++) {
    var thread = profile.threads[i];

    // Some threads contain entire profiles of other processes as strings.
    if (typeof thread == "string") {
      var subprocessProfile = JSON.parse(thread);
      inflateSchemaProfileThreads(subprocessProfile);
      profile.threads[i] = JSON.stringify(subprocessProfile);
      continue;
    }

    var stackTable = thread.stackTable;
    var frameTable = thread.frameTable;
    var stringTable = thread.stringTable;

    var numFrames = frameTable.data.length;
    var inflatedFramesCache = new Array(numFrames);
    // Prefill to ensure no holes.
    for (var j = 0; j < numFrames; j++) {
      inflatedFramesCache[j] = null;
    }

    profile.threads[i] = inflateThread(thread, stackTable, frameTable, stringTable,
                                       inflatedFramesCache);
  }

  profile.meta.version = 2;
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
  var markers = profile.threads[threadId].markers;
  var symbols = profile.symbols;
  var functions = profile.functions;

  if (filters.mergeFunctions) {
    samples = discardLineLevelInformation(samples, symbols, functions);
  }

  if (filters.sampleFilters) {
    samples = unserializeSampleFilters(filters.sampleFilters).reduce(function (filteredSamples, currentFilter) {
      if (currentFilter===null) return filteredSamples;
      return currentFilter.filter(filteredSamples, symbols, functions, filters.mergeFunctions);
    }, samples);
  }

  if (filters.nameFilter) {
    try {
      samples = filterByName(samples, symbols, functions, filters.nameFilter, filters.mergeFunctions);
    } catch (e) {
      dump("Could not filter by name: " + e + "\n");
    }
  }
  if (filters.jankOnly) {
    samples = filterByJank(samples, gJankThreshold);
  }
  if (filters.javascriptOnly) {
    samples = chargeNonJSToCallers(samples, symbols, functions, filters.mergeFunctions);
  }

  // Apply only RangeSampleFilter to markers
  for (var i in filters.sampleFilters) {
    var filter = filters.sampleFilters[i];
    if (filter.type == 'RangeSampleFilter') {
      markers = markers.filter(function(marker){
        return marker.time > filter.start && marker.time < filter.end;
      });
    }
  }

  gProfiles[profileID].filterSettings = filters;
  if (gProfiles[profileID].filteredThreadSamples == null) {
    gProfiles[profileID].filteredThreadSamples = {};
  }
  if (gProfiles[profileID].filteredThreadMarkers == null) {
    gProfiles[profileID].filteredThreadMarkers = {};
  }
  gProfiles[profileID].filteredThreadSamples[threadId] = samples;
  gProfiles[profileID].filteredThreadMarkers[threadId] = markers;
  gProfiles[profileID].selectedThread = threadId;
  if (requestID) {
    sendFinishedInChunks(requestID, samples, 40000,
                         function (sample) { return sample ? sample.frames.length : 1; });
  }
}

function updateViewOptions(requestID, profileID, options, threadId) {
  var profile = gProfiles[profileID];

  // If we have computed any filters, do so now
  if (!profile.filteredThreadSamples) {
    updateFilters(null, profileID, {}, threadId);
  }

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

  function calc_max(array) {
    var max = 0;
    var n = array.length;
    var i = 0;
    var value;
    for (i = 1; i < n; i++) {
      value = array[i];
      if (value > max) max = value;
    }
    return max;
  };

  function calc_min(array) {
    var min = array && array[0] || 0;
    var n = array.length;
    var i = 0;
    var value;
    for (i = 1; i < n; i++) {
      value = array[i];
      if (value < min) min = value;
    }
    return min;
  };

  sendFinished(requestID, {
    minima: calc_min(times),
    maxima: calc_max(times)
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
      var marker = clone(markers[i]);
      if (marker.data && marker.data.stack) {
        marker.data.stack = prepareSample(marker.data.stack, profile.symbols);
      }
      symMarkers.push(marker);
    }
    return symMarkers;
  }

  var profile = gProfiles[profileID];
  var data = profile.filteredThreadSamples[threadId];
  var markers = symbolicateMarkers(profile.filteredThreadMarkers[threadId]);
  var maxHeight = 0;
  for (var i in profile.filteredThreadSamples) {
    maxHeight = Math.max(maxHeight, profile.filteredThreadSamples[i].reduce(function (prev, curr, i, a) {
      curr = getHeight(curr);
      return curr > prev ? curr : prev;
    }, 0) + 1);
  }

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
        color: getStepColor(step)
      };
    });

  sendFinished(requestID, { threadId: threadId, histogramData: histogram, markers: markers });
}

var diagnosticList = [
  // *************** Known bugs first (highest priority)
  {
    image: "eye.png",
    title: "visibility_monitor.js - Bug 967884",
    bugNumber: "967884",
    check: function(frames, symbols, meta, step, thread) {
      if (thread.name.indexOf("(Communications:") == -1) {
        return false;
      }

      return stepContains('@ tag_visibility_monitor', frames, symbols)
          ;
    },
  },
  {
    image: "text.png",
    title: "[Contacts] nsDiplayText overhead is too high - Bug 967292",
    bugNumber: "967292",
    check: function(frames, symbols, meta, step, thread) {
      if (thread.name.indexOf("(Communications:") == -1) {
        return false;
      }

      return stepContains('nsDisplayText', frames, symbols)
          ;
    },
  },
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
    title: "JS - Bug 765930 - Reader Mode: Optimize readability check",
    bugNumber: "765930",
    check: function(frames, symbols, meta) {

      return stepContains('Readability.js', frames, symbols)
          ;
    },
  },

  // **************** General issues
  {
    image: "sync-ipc.png",
    title: "Sync IPC message",
    bugNumber: "1174239",
    check: function(frames, symbols, meta) {
      return stepContains('WaitForSyncNotify', frames, symbols);
    },
  },

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
          || stepContains('CC::RunCycleCollectorSlice', frames, symbols) // Label
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
    if (!(frames[i] in symbols)) {
      stack.push(frames[i]);
      continue;
    }
    var sym = symbols[frames[i]].functionName || symbols[frames[i]].symbolName;
    if (sym.indexOf("mozilla_sampler_tracing(") == 0) {
      break;
    }
    stack.push(sym);
  }
  return stack;
}

function getLayersDump(logMarkers, timeStart, timeEnd) {
  for (var i = 0; i < logMarkers.length; i++) {
    var logMarker = logMarkers[i];
    if (logMarker.name.lastIndexOf("LayerManager (", 0) === 0 &&
        logMarker.time >= timeStart && logMarker.time <= timeEnd) {
      var layersDumpLines = [];

      while (i < logMarkers.length) {
        logMarker = logMarkers[i];
        if (logMarker.name === "") {
          return layersDumpLines;
        }

        var copy = clone(logMarker);
        layersDumpLines.push(copy);
        i++;
      }
      return null; // Could not find the end, error
    }
  }

  return null;
}

function getDisplayList(logMarkers, timeStart, timeEnd) {
  for (var i = 0; i < logMarkers.length; i++) {
    var logMarker = logMarkers[i];
    if (logMarker.name.lastIndexOf("Painting --- before optimization", 0) === 0 &&
        logMarker.time > timeStart && logMarker.time < timeEnd) {
      var displayListLines = [];

      while (i < logMarkers.length) {
        logMarker = logMarkers[i];
        if (logMarker.name === "") {
          return displayListLines;
        }
        var copy = clone(logMarker);
        displayListLines.push(copy);
        i++;
      }
      return null; // Could not find the end, error
    }

  }
  return null;
}

function clone(obj) {
    if (null == obj || "object" != typeof obj) return obj;
    var copy = obj.constructor();
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}

function getThreadLogData(threadId, markers, boundaries) {
  var entries = [];
  boundaries = boundaries || { min: -Infinity, max: Infinity };

  var logMarkers = [];
  for (var markerId in markers) {
    var marker = markers[markerId];

    if (marker.data && marker.data.category == "log" &&
        marker.time >= boundaries.min && marker.time <= boundaries.max) {
      var markerCopy = clone(marker);
      markerCopy.thread = threadId;
      logMarkers.push(markerCopy);
    }

  }

  var i = 0;
  var leftover = null;
  while (i < logMarkers.length) {
    var logMarker = logMarkers[i];
    if (leftover && leftover != "") {
      logMarker.name = leftover + logMarker.name;
      leftover = null;
    }

    if (logMarker.name.split("\n").length > 1) {
      var lines = logMarker.name.split("\n");
      for (var j = 0; j < lines.length - 1; j++) {
        var line = lines[j];
        var lineMarker = clone(logMarker);
        lineMarker.name = line;
        entries.push(lineMarker);
      }
      leftover = lines[lines.length - 1];
    } else {
      leftover = leftover || "";
      leftover += logMarker.name;
    }
    i++;
  }
  return entries;
}

function getLogData(requestID, profileID, boundaries) {
  var profile = gProfiles[profileID];

  var result = {
    entries: [
    ],
  };

  for (var threadId in profile.threads) {
    var thread = profile.threads[threadId];
    var markers = thread.markers;
    var threadLogMarkers = getThreadLogData(threadId, markers, boundaries);

    for (var i = 0; i < threadLogMarkers.length; i++) {
      result.entries.push(threadLogMarkers[i]);
    }
  }

  result.entries.sort(function(a, b) {
    return a.time - b.time;
  });

  sendFinished(requestID, result);
}

// Within each marker type the returned markers should be sorted in ascending order
// by time and be non-overlapping
function calculateWaterfallData(requestID, profileID, boundaries, selectedThreadId) {
  var profile = gProfiles[profileID];
  var symbols = profile.functions;

  var result = {
    boundaries: boundaries,
    items: [],
    compositeTimes: [],
    framePositions: {},
    vsyncTimes: [],
    threadsToView: [],
    selectedThreadId: selectedThreadId,
  };

  var mainThread = null;
  var mainThreadMarkers = null;
  var mainThreadId;
  var compThread = null;
  var compThreadMarkers = null;
  var compThreadId;
  
  // List possible threads
  for (var threadId in profile.threads) {
    var thread = profile.threads[threadId];
    if (thread.name &&
       (/^Gecko(?![\w\d])|^Gecko$/.test(thread.name) ||
        /^GeckoMain(?![\w\d])|^GeckoMain$/.test(thread.name))) {
      result.threadsToView.push({
        name: thread.name,
        threadId: threadId,
      });
    } else if (thread.name &&
               /^Content$/.test(thread.name)) {
      result.threadsToView.push({
        name: thread.name,
        threadId: threadId,
      });
    }
  }

  // Find the threads used the generate the view
  for (var threadId in profile.threads) {
    var thread = profile.threads[threadId];
    // In these regexes we look for any thread named X by checking if
    // X is either followed by something other than a character or digit
    // or is the whole name
    if (
      (thread.name &&
        selectedThreadId == null &&
       (/^Gecko(?![\w\d])|^Gecko$/.test(thread.name) ||
        /^Content(.*)|^Content$/.test(thread.name) ||
        /^GeckoMain(?![\w\d])|^GeckoMain$/.test(thread.name))) ||
       selectedThreadId && selectedThreadId == threadId) {
      mainThread = thread.samples;
      mainThreadMarkers = thread.markers;
      mainThreadId = threadId;
    } else if (thread.name &&
        /^Compositor(?![\w\d])|^Compositor$/.test(thread.name)) {
      compThread = thread.samples;
      compThreadMarkers = thread.markers;
      compThreadId = threadId;
    }
  }

  if (!mainThread ||
      boundaries.min == -Infinity || boundaries.min == Infinity ||
      boundaries.max == -Infinity || boundaries.max == Infinity) {
    sendFinished(requestID, null);
    return null;
  }

  function getPaintMarkers(markersIn) {
    var markersOut = [];
    for (var i = 0; i < markersIn.length; i++) {
      if (markersIn[i].data &&
          markersIn[i].data.category == "Paint") {
        markersOut.push(markersIn[i]);
      }
    }
    return markersOut;
  }

  function getGPUMarkers(markersIn, boundaries) {
    return getCategoryMarkers(markersIn, boundaries, "gpu_timer_query");
  }

  function appendToLayer(framePositions, layer, position) {
    if (framePositions[layer] == undefined) {
      framePositions[layer] = [];
    }

    framePositions[layer].push(position);
  }

  function filterLayerPositionByLayer(markersIn) {
    // returns layer -> { layerAddress: [[x0, y0], [x1, y1]] }
    var framePositions = {};
    for (var i = 0; i < markersIn.length; i++) {
      var marker = markersIn[i];
      var layerLabel = marker.data.layer;
      var position = [marker.data.x, marker.data.y];

      // Tracking layers that are always 0 makes the graph super slow to parse
      // so filter them out for now
      if (position[0] != 0 || position[1] != 0) {
        appendToLayer(framePositions, layerLabel, position);
      }
    }

    return framePositions;;
  }

  function getCategoryMarkers(markersIn, boundaries, category) {
    var markersOut = [];
    for (var i = 0; i < markersIn.length; i++) {
      if (markersIn[i].data &&
          markersIn[i].name == category) {
        var time = markersIn[i].time;
        if (time >= boundaries.min && time <= boundaries.max) {
          markersOut.push(markersIn[i]);
        }
      }
    }

    return markersOut;
  }

  function addVsyncMarkers() {
    for (i = 0; i < result.vsyncTimes.length; i++) {
      var vsyncTime = result.vsyncTimes[i];
      result.items.push({
        startTime: vsyncTime.data.vsync,
        endTime: vsyncTime.data.vsync + 0.5,  // make a 0.5 ms marker for readability only
        text: "Vsync",
        type: "Vsync",
      });
    }
  }

  function addMainThreadMarkers() {
    var startTime = {};
    var stack = {};
    var isInRefreshDriver = false;
    var trivialFrame;
    var frameNumber = 0;
    var scriptsNumber = 0;
    var reflowNumber = 0;
    var stylesNumber = 0;
    var displayListNumber = 0;
    var rasterizeNumber = 0;
    var lastDisplayListBlock = null;

    paintMarkers = getPaintMarkers(mainThreadMarkers);
    var mainThreadLogData = getThreadLogData(mainThreadId, mainThreadMarkers);
    for (i = 0; i < paintMarkers.length; i++) {
      marker = paintMarkers[i];
      if (marker.name == "RD" && marker.data.interval == "start") {
        isInRefreshDriver = true;
        trivialFrame = true;
        startTime[marker.name] = marker.time;
      } else if(isInRefreshDriver && marker.name == "RD" && marker.data.interval == "end") {
        isInRefreshDriver = false;
        if (!trivialFrame && startTime[marker.name]) {
          result.items.push({
            startTime: startTime[marker.name],
            endTime: marker.time,
            text: "Refresh " + frameNumber++,
            type: "RD",
          });
          // Prepare the GPU Markers
          var bounds = { min: startTime[marker.name], max: marker.time };
          var gpuMarkers = getGPUMarkers(mainThreadMarkers, bounds)
          var currGpuTime = startTime[marker.name];
          var endTime = marker.time;
          var totalGpuTimeThisFrame = 0;
          for (var j = 0; j < gpuMarkers.length; j++) {
            var gpuMarker = gpuMarkers[j];
            var len = gpuMarker.data.gpuend / 1000000; // ns to ms
            totalGpuTimeThisFrame += len;
          }
          for (var j = 0; j < gpuMarkers.length; j++) {
            var gpuMarker = gpuMarkers[j];
            var len = gpuMarker.data.gpuend / 1000000; // ns to ms
            result.items.push({
              startTime: currGpuTime,
              endTime: currGpuTime + len,
              text: "GPU Content (Ttl. " + totalGpuTimeThisFrame.toFixed(2) + " ms)\nCPU: " + (gpuMarker.data.cpuend - gpuMarker.data.cpustart).toFixed(2) + " ms\nGPU: ",
              type: "ContentGPU",
            });
            currGpuTime += len;
            if (currGpuTime > endTime) {
              break; // gpu bound
            }
          }
          /*
          var gpuMarkers = getGPUMarkers(compThreadMarkers, bounds)
          var currGpuTime = startTime[marker.name];
          var totalGpuTimeThisFrame = 0;
          var endTime = marker.time;
          for (var j = 0; j < gpuMarkers.length; j++) {
            var gpuMarker = gpuMarkers[j];
            var len = gpuMarker.data.gpuend / 1000000; // ns to ms
            totalGpuTimeThisFrame += len;
          }
          for (var j = 0; j < gpuMarkers.length; j++) {
            var gpuMarker = gpuMarkers[j];
            var len = gpuMarker.data.gpuend / 1000000; // ns to ms
            result.items.push({
              startTime: currGpuTime,
              endTime: currGpuTime + len,
              text: "GPU (Ttl. " + totalGpuTimeThisFrame.toFixed(2) + " ms)\nCPU: " + (gpuMarker.data.cpuend - gpuMarker.data.cpustart) + " ms\nGPU: ",
              type: "CompositorGPU",
            });
            currGpuTime += len;
            if (currGpuTime > endTime) {
              break; // gpu bound
            }
          }*/
        }
        if (lastDisplayListBlock && !lastDisplayListBlock.displayListDump) {
          var displayListDump = getDisplayList(mainThreadLogData, startTime[marker.name], marker.time);
          if (displayListDump) {
            lastDisplayListBlock.displayListDump = displayListDump;
          }
        }
        startTime[marker.name] = null;
      } else if (isInRefreshDriver) {
        if (marker.name == "Scripts" && marker.data.interval == "start") {
          startTime[marker.name] = marker.time;
        } else if (marker.name == "Scripts" && marker.data.interval == "end" && startTime[marker.name]) {
          result.items.push({
            startTime: startTime[marker.name],
            endTime: marker.time,
            text: "Scripts #" + scriptsNumber,
            type: "Scripts",
          });
          startTime[marker.name] = null;
        } else if (marker.name == "Styles" && marker.data.interval == "start") {
          startTime[marker.name] = marker.time;
          stack[marker.name] = marker.data.stack;
        } else if (marker.name == "Styles" && marker.data.interval == "end" && startTime[marker.name]) {
          result.items.push({
            startTime: startTime[marker.name],
            endTime: marker.time,
            text: "Styles" + " #" + stylesNumber++,
            type: "Styles",
          });
          if (stack[marker.name]) {
            result.items[result.items.length - 1].causeStack = prepareSample(stack[marker.name], profile.symbols);
            stack[marker.name] = null;
          }
          startTime[marker.name] = null;
        } else if (marker.name == "Reflow" && marker.data.interval == "start") {
          startTime[marker.name] = marker.time;
          stack[marker.name] = marker.data.stack;
        } else if (marker.name == "Reflow" && marker.data.interval == "end" && startTime[marker.name]) {
          result.items.push({
            startTime: startTime[marker.name],
            endTime: marker.time,
            text: marker.name + " #" + reflowNumber++,
            type: marker.name,
          });
          if (stack[marker.name]) {
            result.items[result.items.length - 1].causeStack = prepareSample(stack[marker.name], profile.symbols);
            stack[marker.name] = null;
          }
          startTime[marker.name] = null;
        } else if (marker.name == "DisplayList" && marker.data.interval == "start") {
          startTime[marker.name] = marker.time;
          trivialFrame = false;
        } else if (marker.name == "DisplayList" && marker.data.interval == "end" && startTime[marker.name]) {
          result.items.push({
            startTime: startTime[marker.name],
            endTime: marker.time,
            text: marker.name + " #" + displayListNumber++,
            type: marker.name,
          });
          lastDisplayListBlock =  result.items[result.items.length - 1];
          var displayListDump = getDisplayList(mainThreadLogData, startTime[marker.name], marker.time);
          if (displayListDump && lastDisplayListBlock) {
            lastDisplayListBlock.displayListDump = displayListDump;
          }
          startTime[marker.name] = null;
        } else if (marker.name == "Rasterize" && marker.data.interval == "start") {
          if (result.items.length >= 1) {
            // If we hit Rasterize we stop the DisplayList phase
            var prevItem = result.items[result.items.length - 1];
            result.items.push({
              startTime: prevItem.endTime,
              endTime: marker.time,
              text: "DisplayList #" + displayListNumber++,
              type: "DisplayList",
            });
            lastDisplayListBlock =  result.items[result.items.length - 1];
            var displayListDump = getDisplayList(mainThreadLogData, prevItem.endTime, marker.time);
            if (displayListDump && lastDisplayListBlock) {
              lastDisplayListBlock.displayListDump = displayListDump;
            }
            startTime["DisplayList"] = null;
          }
          startTime[marker.name] = marker.time;
        } else if (marker.name == "Rasterize" && marker.data.interval == "end" && startTime[marker.name]) {
          result.items.push({
            startTime: startTime[marker.name],
            endTime: marker.time,
            text: marker.name + " #" + rasterizeNumber++,
            type: marker.name,
          });
          startTime[marker.name] = null;
        }
      }
    }
  }

  function addGPUMarkers() {
  }

  function addCompositorThreadMarkers() {
    if (compThread) {
      var startComposite = null;
      var compositeNumber = 0;
      var layerTransactionNumber = 0;
      var startSyncLayer;

      paintMarkers = getPaintMarkers(compThreadMarkers);
      var frameMarkers = getCategoryMarkers(compThreadMarkers, boundaries, "LayerTranslation");
      result.framePositions = filterLayerPositionByLayer(frameMarkers);
      result.vsyncTimes = getCategoryMarkers(compThreadMarkers, boundaries, "VsyncTimestamp");
      addVsyncMarkers();

      var compositorLogData = getThreadLogData(compThreadId, compThreadMarkers);
      for (i = 0; i < paintMarkers.length; i++) {
        marker = paintMarkers[i];
        if (marker.name == "Composite" && marker.data.interval == "start") {
          startComposite = marker.time;

          if (marker.time >= boundaries.min && marker.time <= boundaries.max) {
            result.compositeTimes.push(marker.time);
          }
        } else if (marker.name == "Composite" && marker.data.interval == "end") {
          result.items.push({
            startTime: startComposite,
            endTime: marker.time,
            text: "Composite #" + compositeNumber++,
            type: "Composite",
          });
          var layersDump = getLayersDump(compositorLogData, startComposite, marker.time);
          if (layersDump) {
            result.items[result.items.length - 1].layersDump = layersDump;
          }
          // Prepare the GPU Markers
          var bounds = { min: startComposite, max: marker.time };
          var gpuMarkers = getGPUMarkers(compThreadMarkers, bounds)
          var currGpuTime = startComposite;
          var endTime = marker.time;
          var totalGpuTimeThisFrame = 0;
          for (var j = 0; j < gpuMarkers.length; j++) {
            var gpuMarker = gpuMarkers[j];
            var len = gpuMarker.data.gpuend / 1000000; // ns to ms
            totalGpuTimeThisFrame += len;
          }
          for (var j = 0; j < gpuMarkers.length; j++) {
            var gpuMarker = gpuMarkers[j];
            var len = gpuMarker.data.gpuend / 1000000; // ns to ms
            result.items.push({
              startTime: currGpuTime,
              endTime: currGpuTime + len,
              text: "GPU Compositor (Ttl. " + totalGpuTimeThisFrame.toFixed(2) + " ms)\nCPU: " + (gpuMarker.data.cpuend - gpuMarker.data.cpustart).toFixed(2) + " ms\nGPU: ",
              type: "CompositorGPU",
            });
            currGpuTime += len;
            if (currGpuTime > Math.max(startComposite + 15, endTime)) {
              break; // gpu bound
            }
          }
          startComposite = null;
        } else if (marker.name == "LayerTransaction" && marker.data.interval == "start" ) {
          startSyncLayer = marker.time;
        } else if (marker.name == "LayerTransaction" && marker.data.interval == "end" ) {
          result.items.push({
            startTime: startSyncLayer,
            endTime: marker.time,
            text: "LayerTransaction" + layerTransactionNumber++,
            type: "LayerTransaction",
          });
          startSyncLayer = 0;
        }
      }
    }
  }

  var mainThreadState = "Waiting";
  var compThreadState = "Waiting";
  var compThreadPos = 0;
  var time = boundaries.minima;
  var paintMarkers, i, marker;

  addMainThreadMarkers();
  addCompositorThreadMarkers();
  addGPUMarkers();

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
        return diagnostic.check(frames, symbols, meta, step, profile.threads[threadId]);
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

if (!Function.prototype.bind) {
  Function.prototype.bind = function(oThis) {
    if (typeof this !== 'function') {
      // closest thing possible to the ECMAScript 5
      // internal IsCallable function
      throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
    }

    var aArgs   = Array.prototype.slice.call(arguments, 1),
        fToBind = this,
        fNOP    = function() {},
        fBound  = function() {
          return fToBind.apply(this instanceof fNOP && oThis
                 ? this
                 : oThis,
                 aArgs.concat(Array.prototype.slice.call(arguments)));
        };

    fNOP.prototype = this.prototype;
    fBound.prototype = new fNOP();

    return fBound;
  };
}
