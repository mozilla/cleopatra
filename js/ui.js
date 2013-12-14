var EIDETICKER_BASE_URL = "http://eideticker.wrla.ch/";

var gDebugLog = false;
var gDebugTrace = false;
var gLocation = window.location + "";
if (gLocation.indexOf("file:") == 0) {
  gDebugLog = true;
  gDebugTrace = true;
  PROFILERLOG("Turning on logging+tracing since cleopatra is served from the file protocol");
}
// Use for verbose tracing, otherwise use log
function PROFILERTRACE(msg) {
  if (gDebugTrace)
    PROFILERLOG(msg);
}
function PROFILERLOG(msg) {
  if (gDebugLog) {
    msg = "Cleo: " + msg;
    console.log(msg);
    if (window.dump)
      window.dump(msg + "\n");
  }
}
function PROFILERERROR(msg) {
  msg = "Cleo: " + msg;
  console.log(msg);
  if (window.dump)
    window.dump(msg + "\n");
}
function enableProfilerTracing() {
  gDebugLog = true;
  gDebugTrace = true;
  Parser.updateLogSetting();
}
function enableProfilerLogging() {
  gDebugLog = true;
  Parser.updateLogSetting();
}

function removeAllChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function treeObjSort(a, b) {
  return b.counter - a.counter;
}

function ProfileTreeManager() {
  this.treeView = new TreeView();
  this.treeView.setColumns([
    { name: "sampleCount", title: "Running time" },
    { name: "selfSampleCount", title: "Self" },
    { name: "resource", title: "" },
    { name: "symbolName", title: "Symbol Name"}
  ]);
  var self = this;
  this.treeView.addEventListener("select", function (frameData) {
    self.highlightFrame(frameData);
    if (window.comparator_setSelection) {
      window.comparator_setSelection(gTreeManager.serializeCurrentSelectionSnapshot(), frameData);
    }
  });
  this.treeView.addEventListener("contextMenuClick", function (e) {
    self._onContextMenuClick(e);
  });
  this.treeView.addEventListener("focusCallstackButtonClicked", function (frameData) {
    var focusedCallstack = self._getCallstackUpTo(frameData);
    focusOnCallstack(focusedCallstack, frameData.name);
  });
  this._container = document.createElement("div");
  this._container.className = "tree";
  this._container.appendChild(this.treeView.getContainer());

  // If this is set when the tree changes the snapshot is immediately restored.
  this._savedSnapshot = null;
}
ProfileTreeManager.prototype = {
  getContainer: function ProfileTreeManager_getContainer() {
    return this._container;
  },
  highlightFrame: function Treedisplay_highlightFrame(frameData) {
    setHighlightedCallstack(this._getCallstackUpTo(frameData), this._getHeaviestCallstack(frameData));
  },
  dataIsOutdated: function ProfileTreeManager_dataIsOutdated() {
    this.treeView.dataIsOutdated();
  },
  saveSelectionSnapshot: function ProfileTreeManager_saveSelectionSnapshot(isJavascriptOnly) {
    this._savedSnapshot = this.treeView.getSelectionSnapshot(isJavascriptOnly);
  },
  saveReverseSelectionSnapshot: function ProfileTreeManager_saveReverseSelectionSnapshot(isJavascriptOnly) {
    this._savedSnapshot = this.treeView.getReverseSelectionSnapshot(isJavascriptOnly);
  },
  hasNonTrivialSelection: function ProfileTreeManager_hasNonTrivialSelection() {
    return this.treeView.getSelectionSnapshot().length > 1;
  },
  serializeCurrentSelectionSnapshot: function ProfileTreeManager_serializeCurrentSelectionSnapshot() {
    return JSON.stringify(this.treeView.getSelectionSnapshot());
  },
  restoreSerializedSelectionSnapshot: function ProfileTreeManager_restoreSerializedSelectionSnapshot(selection) {
    this._savedSnapshot = JSON.parse(selection);
  },
  _restoreSelectionSnapshot: function ProfileTreeManager__restoreSelectionSnapshot(snapshot, allowNonContigous) {
    return this.treeView.restoreSelectionSnapshot(snapshot, allowNonContigous);
  },
  setSelection: function ProfileTreeManager_setSelection(frames) {
    return this.treeView.setSelection(frames);
  },
  _getCallstackUpTo: function ProfileTreeManager__getCallstackUpTo(frame) {
    var callstack = [];
    var curr = frame;
    while (curr != null) {
      if (curr.name != null) {
        var subCallstack = curr.fullFrameNamesAsInSample.clone();
        subCallstack.reverse();
        callstack = callstack.concat(subCallstack);
      }
      curr = curr.parent;
    }
    callstack.reverse();
    if (gInvertCallstack)
      callstack.shift(); // remove (total)
    return callstack;
  },
  _getHeaviestCallstack: function ProfileTreeManager__getHeaviestCallstack(frame) {
    // FIXME: This gets the first leaf which is not the heaviest leaf.
    while(frame.children && frame.children.length > 0) {
      var nextFrame = frame.children[0].getData();
      if (!nextFrame)
        break;
      frame = nextFrame;
    }
    return this._getCallstackUpTo(frame);
  },
  _onContextMenuClick: function ProfileTreeManager__onContextMenuClick(e) {
    var node = e.node;
    var menuItem = e.menuItem;

    if (menuItem == "View Source") {
      // Remove anything after ( since MXR doesn't handle search with the arguments.
      var symbol = node.name.split("(")[0];
      window.open("http://mxr.mozilla.org/mozilla-central/search?string=" + symbol, "View Source");
    } else if (menuItem == "View JS Source") {
      viewJSSource(node);
    } else if (menuItem == "Plugin View: Pie") {
      focusOnPluginView("protovis", {type:"pie"});
    } else if (menuItem == "Plugin View: Tree") {
      focusOnPluginView("protovis", {type:"tree"});
    } else if (menuItem == "Google Search") {
      var symbol = node.name;
      window.open("https://www.google.ca/search?q=" + symbol, "View Source");
    } else if (menuItem == "Focus Frame") {
      var symbol = node.fullFrameNamesAsInSample[0]; // TODO: we only function one symbol when callpath merging is on, fix that
      focusOnSymbol(symbol, node.name);
    } else if (menuItem == "Focus Callstack") {
      var focusedCallstack = this._getCallstackUpTo(node);
      focusOnCallstack(focusedCallstack, node.name);
    }
  },
  setAllowNonContigous: function ProfileTreeManager_setAllowNonContigous() {
    this._allowNonContigous = true;
  },
  display: function ProfileTreeManager_display(tree, symbols, functions, resources, useFunctions, filterByName) {
    this.treeView.display(this.convertToJSTreeData(tree, symbols, functions, useFunctions), resources, filterByName);
    if (this._savedSnapshot) {
      var old = this._savedSnapshot.clone();
      this._restoreSelectionSnapshot(this._savedSnapshot, this._allowNonContigous);
      this._savedSnapshot = old;
      this._allowNonContigous = false;
    }
  },
  convertToJSTreeData: function ProfileTreeManager__convertToJSTreeData(rootNode, symbols, functions, useFunctions) {
    var totalSamples = rootNode.counter;
    function createTreeViewNode(node, parent) {
      var curObj = {};
      curObj.parent = parent;
      curObj.counter = node.counter;
      var selfCounter = node.counter;
      for (var i = 0; i < node.children.length; ++i) {
        selfCounter -= node.children[i].counter;
      }
      curObj.selfCounter = selfCounter;
      curObj.ratio = node.counter / totalSamples;
      curObj.fullFrameNamesAsInSample = node.mergedNames ? node.mergedNames : [node.name];
      if (!(node.name in (useFunctions ? functions : symbols))) {
        curObj.name = node.name;
        curObj.library = "";
      } else {
        var functionObj = useFunctions ? functions[node.name] : functions[symbols[node.name].functionIndex];
        var info = {
          functionName: functionObj.functionName,
          libraryName: functionObj.libraryName,
          lineInformation: useFunctions ? "" : symbols[node.name].lineInformation
        };  
        curObj.name = (info.functionName + " " + info.lineInformation).trim();
        curObj.library = info.libraryName;
        curObj.isJSFrame = functionObj.isJSFrame;
        if (functionObj.scriptLocation) {
          curObj.scriptLocation = functionObj.scriptLocation;
        }
      }
      if (node.children.length) {
        curObj.children = getChildrenObjects(node.children, curObj);
      }
      return curObj;
    }
    function getChildrenObjects(children, parent) {
      var sortedChildren = children.slice(0).sort(treeObjSort);
      return sortedChildren.map(function (child) {
        var createdNode = null;
        return {
          getData: function () {
            if (!createdNode) {
              createdNode = createTreeViewNode(child, parent); 
            }
            return createdNode;
          }
        };
      });
    }
    return getChildrenObjects([rootNode], null);
  },
};

function effectiveInterval() {
  var data = gCurrentlyShownSampleData;
  var interval = 0.0;
  var sampleCount = 0;
  var timeCount = 0;
  var lastTime = null;
  for (var i = 0; i < data.length; ++i) {
    if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["time"]) {
      lastTime = null;
      continue;
    }
    if (lastTime) {
      sampleCount++;
      timeCount += data[i].extraInfo["time"] - lastTime;
    }
    lastTime = data[i].extraInfo["time"];
  }
  var effectiveInterval = timeCount/sampleCount;
  // Biggest diff
  var biggestDiff = 0;
  lastTime = null;
  for (var i = 0; i < data.length; ++i) {
    if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["time"]) {
      lastTime = null;
      continue;
    }
    if (lastTime) {
      if (biggestDiff < Math.abs(effectiveInterval - (data[i].extraInfo["time"] - lastTime)))
        biggestDiff = Math.abs(effectiveInterval - (data[i].extraInfo["time"] - lastTime));
    }
    lastTime = data[i].extraInfo["time"];
  }

  if (effectiveInterval != effectiveInterval)
    return "Time info not collected";

  return (effectiveInterval).toFixed(2) + " ms ±" + biggestDiff.toFixed(2);
}

function numberOfCurrentlyShownSamples() {
  var data = gCurrentlyShownSampleData;
  var num = 0;
  for (var i = 0; i < data.length; ++i) {
    if (data[i])
      num++;
  }
  return num;
}

function avgResponsiveness() {
  var data = gCurrentlyShownSampleData;
  var totalRes = 0.0;
  for (var i = 0; i < data.length; ++i) {
    if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["responsiveness"])
      continue;
    totalRes += data[i].extraInfo["responsiveness"];
  }
  return totalRes / numberOfCurrentlyShownSamples();
}

function copyProfile() {
  window.prompt ("Copy to clipboard: Ctrl+C, Enter", document.getElementById("data").value);
}

function saveProfileToLocalStorage() {
  Parser.getSerializedProfile(true, function (serializedProfile) {
    gLocalStorage.storeLocalProfile(serializedProfile, gMeta.profileId, function profileSaved() {

    });
  });
}
function downloadProfile() {
  Parser.getSerializedProfile(true, function (serializedProfile) {
    var blob = new Blob([serializedProfile], { "type": "application/octet-stream" });
    location.href = window.URL.createObjectURL(blob);
  });
}

function promptUploadProfile(selected) {
  var overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "transparent";

  var bg = document.createElement("div");
  bg.style.position = "absolute";
  bg.style.top = 0;
  bg.style.left = 0;
  bg.style.width = "100%";
  bg.style.height = "100%";
  bg.style.opacity = "0.6";
  bg.style.backgroundColor = "#aaaaaa";
  overlay.appendChild(bg);

  var contentDiv = document.createElement("div");
  contentDiv.className = "sideBar";
  contentDiv.style.position = "absolute";
  contentDiv.style.top = "50%";
  contentDiv.style.left = "50%";
  contentDiv.style.width = "40em";
  contentDiv.style.height = "20em";
  contentDiv.style.marginLeft = "-20em";
  contentDiv.style.marginTop = "-10em";
  contentDiv.style.padding = "10px";
  contentDiv.style.border = "2px solid black";
  contentDiv.style.backgroundColor = "rgb(219, 223, 231)";
  overlay.appendChild(contentDiv);

  var noticeHTML = "";
  noticeHTML += "<center><h2 style='font-size: 2em'>Upload Profile - Privacy Notice</h2></center>";
  noticeHTML += "You're about to upload your profile publicly where anyone will be able to access it. ";
  noticeHTML += "To better diagnose performance problems profiles include the following information:";
  noticeHTML += "<ul>";
  noticeHTML += " <li>The <b>URLs</b> and scripts of the tabs that were executing.</li>";
  noticeHTML += " <li>The <b>metadata of all your Add-ons</b> to identify slow Add-ons.</li>";
  noticeHTML += " <li>Firefox build and runtime configuration.</li>";
  noticeHTML += "</ul><br>";
  noticeHTML += "To view all the information you can download the full profile to a file and open the json structure with a text editor.<br><br>";
  contentDiv.innerHTML = noticeHTML;

  var cancelButton = document.createElement("input");
  cancelButton.style.position = "absolute";
  cancelButton.style.bottom = "10px";
  cancelButton.type = "button";
  cancelButton.value = "Cancel";
  cancelButton.onclick = function() {
    document.body.removeChild(overlay);
  }
  contentDiv.appendChild(cancelButton);

  var uploadButton = document.createElement("input");
  uploadButton.style.position = "absolute";
  uploadButton.style.right = "10px";
  uploadButton.style.bottom = "10px";
  uploadButton.type = "button";
  uploadButton.value = "Upload";
  uploadButton.onclick = function() {
    document.body.removeChild(overlay);
    uploadProfile(selected);
  }
  contentDiv.appendChild(uploadButton);

  document.body.appendChild(overlay);
}

function uploadProfile(selected) {
  Parser.getSerializedProfile(!selected, function (dataToUpload) {
    var oXHR = new XMLHttpRequest();
    oXHR.onload = function (oEvent) {
      if (oXHR.status == 200) {  
        gReportID = oXHR.responseText;
        updateDocumentURL();
        document.getElementById("upload_status").innerHTML = "Success! Use this <a id='linkElem'>link</a>";
        document.getElementById("linkElem").href = document.URL;
      } else {  
        document.getElementById("upload_status").innerHTML = "Error " + oXHR.status + " occurred uploading your file.";
      }  
    };
    oXHR.onerror = function (oEvent) {
      document.getElementById("upload_status").innerHTML = "Error " + oXHR.status + " occurred uploading your file.";
    }
    oXHR.upload.onprogress = function(oEvent) {
      if (oEvent.lengthComputable) {
        var progress = Math.round((oEvent.loaded / oEvent.total)*100);
        if (progress == 100) {
          document.getElementById("upload_status").innerHTML = "Uploading: Waiting for server side compression";
        } else {
          document.getElementById("upload_status").innerHTML = "Uploading: " + Math.round((oEvent.loaded / oEvent.total)*100) + "%";
        }
      }
    };

    var dataSize;
    if (dataToUpload.length > 1024*1024) {
      dataSize = (dataToUpload.length/1024/1024).toFixed(1) + " MB(s)";
    } else {
      dataSize = (dataToUpload.length/1024).toFixed(1) + " KB(s)";
    }

    var formData = new FormData();
    formData.append("file", dataToUpload);
    document.getElementById("upload_status").innerHTML = "Uploading Profile (" + dataSize + ")";
    oXHR.open("POST", "http://profile-store.appspot.com/store", true);
    oXHR.send(formData);
  });
}

function populate_skip_symbol() {
  var skipSymbolCtrl = document.getElementById('skipsymbol')
  //skipSymbolCtrl.options = gSkipSymbols;
  for (var i = 0; i < gSkipSymbols.length; i++) {
    var elOptNew = document.createElement('option');
    elOptNew.text = gSkipSymbols[i];
    elOptNew.value = gSkipSymbols[i];
    elSel.add(elOptNew);
  }
    
}

function delete_skip_symbol() {
  var skipSymbol = document.getElementById('skipsymbol').value
}

function add_skip_symbol() {
  
}

var gFilterChangeCallback = null;
var gFilterChangeDelay = 1200;
function filterOnChange() {
  if (gFilterChangeCallback != null) {
    clearTimeout(gFilterChangeCallback);
    gFilterChangeCallback = null;
  }

  gFilterChangeCallback = setTimeout(filterUpdate, gFilterChangeDelay);
}
function filterUpdate() {
  gFilterChangeCallback = null;

  filtersChanged(); 

  var filterNameInput = document.getElementById("filterName");
  if (filterNameInput != null) {
    changeFocus(filterNameInput);
  } 
}

// Maps document id to a tooltip description
var tooltip = {
  "mergeFunctions" : "Ignore line information and merge samples based on function names.",
  "showJank" : "Show only samples with >50ms responsiveness.",
  "showJS" : "Show only samples which involve running chrome or content Javascript code.",
  "mergeUnbranched" : "Collapse unbranched call paths in the call tree into a single node.",
  "filterName" : "Show only samples with a frame containing the filter as a substring.",
  "invertCallstack" : "Invert the callstack (Heavy view) to find the most expensive leaf functions.",
  "upload" : "Upload the full profile to public cloud storage to share with others.",
  "upload_select" : "Upload only the selected view.",
  "download" : "Initiate a download of the full profile.",
}

function addTooltips() {
  for (var elemId in tooltip) {
    var elem = document.getElementById(elemId); 
    if (!elem)
      continue;
    if (elem.parentNode.nodeName.toLowerCase() == "label")
      elem = elem.parentNode;
    elem.title = tooltip[elemId];
  }
}

var gNumSamples = 0;
var gMeta = null;
var gSymbols = {};
var gFunctions = {};
var gResources = {};
var gHighlightedCallstack = [];
var gFrameView = null;
var gTreeManager = null;
var gSampleBar = null;
var gBreadcrumbTrail = null;
var gHistogramView = null;
var gDiagnosticBar = null;
var gVideoPane = null;
var gPluginView = null;
var gFileList = null;
var gInfoBar = null;
var gMainArea = null;
var gCurrentlyShownSampleData = null;
var gSkipSymbols = ["test2", "test1"];
var gAppendVideoCapture = null;
var gQueryParamFilterName = null;
var gRestoreSelection = null;
var gReportID = null;

function getTextData() {
  var data = [];
  var samples = gCurrentlyShownSampleData;
  for (var i = 0; i < samples.length; i++) {
    data.push(samples[i].lines.join("\n"));
  }
  return data.join("\n");
}

function loadProfileFile(fileList) {
  if (fileList.length == 0)
    return;
  var file = fileList[0];
  var reporter = enterProgressUI();
  var subreporters = reporter.addSubreporters({
    fileLoading: 1000,
    parsing: 1000
  });

  var reader = new FileReader();
  reader.onloadend = function () {
    subreporters.fileLoading.finish();
    loadRawProfile(subreporters.parsing, reader.result);
  };
  reader.onprogress = function (e) {
    subreporters.fileLoading.setProgress(e.loaded / e.total);
  };
  reader.readAsText(file, "utf-8");
  subreporters.fileLoading.begin("Reading local file...");
}

function loadLocalStorageProfile(profileKey) {
  var reporter = enterProgressUI();
  var subreporters = reporter.addSubreporters({
    fileLoading: 1000,
    parsing: 1000
  });

  gLocalStorage.getProfile(profileKey, function(profile) {
    subreporters.fileLoading.finish();
    loadRawProfile(subreporters.parsing, profile, profileKey);
  });
  subreporters.fileLoading.begin("Reading local storage...");
}

function appendVideoCapture(videoCapture) {
  if (videoCapture.indexOf("://") == -1) {
    videoCapture = EIDETICKER_BASE_URL + videoCapture;
  }
  gAppendVideoCapture = videoCapture;
}

function loadZippedProfileURL(url) {
  var reporter = enterProgressUI();
  var subreporters = reporter.addSubreporters({
    fileLoading: 1000,
    parsing: 1000
  });

  // Crude way to detect if we're using a relative URL or not :(
  if (url.indexOf("://") == -1) {
    url = EIDETICKER_BASE_URL + url;
  }
  reporter.begin("Fetching " + url);
  PROFILERTRACE("Fetch url: " + url);

  function onerror(e) {
    PROFILERERROR("zip.js error");
    PROFILERERROR(JSON.stringify(e));
  }

  zip.workerScriptsPath = "js/zip.js/";
  zip.createReader(new zip.HttpReader(url), function(zipReader) {
    subreporters.fileLoading.setProgress(0.4);
    zipReader.getEntries(function(entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        PROFILERTRACE("Zip file: " + entry.filename);
        if (entry.filename === "symbolicated_profile.txt") {
          reporter.begin("Decompressing " + url);
          subreporters.fileLoading.setProgress(0.8);
          entry.getData(new zip.TextWriter(), function(profileText) {
            subreporters.fileLoading.finish();
            loadRawProfile(subreporters.parsing, profileText);
          });
          return;
        }
        onerror("symbolicated_profile.txt not found in zip file.");
      }
    });
  }, onerror);
}

function loadProfileURL(url) {
  var reporter = enterProgressUI();
  var subreporters = reporter.addSubreporters({
    fileLoading: 1000,
    parsing: 1000
  });

  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.responseType = "text";
  xhr.onreadystatechange = function (e) {
    if (xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0)) {
      subreporters.fileLoading.finish();
      PROFILERLOG("Got profile from '" + url + "'.");
      if (xhr.responseText == null || xhr.responseText === "") {
        subreporters.fileLoading.begin("Profile '" + url + "' is empty. Did you set the CORS headers?");
        return;
      }
      loadRawProfile(subreporters.parsing, xhr.responseText, url);
    }
  };
  xhr.onerror = function (e) { 
    subreporters.fileLoading.begin("Error fetching profile :(. URL: '" + url + "'. Did you set the CORS headers?");
  }
  xhr.onprogress = function (e) {
    if (e.lengthComputable && (e.loaded <= e.total)) {
      subreporters.fileLoading.setProgress(e.loaded / e.total);
    } else {
      subreporters.fileLoading.setProgress(NaN);
    }
  };
  xhr.send(null);
  subreporters.fileLoading.begin("Loading remote file...");
}

function loadProfile(rawProfile) {
  if (!rawProfile)
    return;
  var reporter = enterProgressUI();
  loadRawProfile(reporter, rawProfile);
}

function loadRawProfile(reporter, rawProfile, profileId) {
  PROFILERLOG("Parse raw profile: ~" + rawProfile.length + " bytes");
  reporter.begin("Parsing...");
  if (rawProfile == null || rawProfile.length === 0) {
    reporter.begin("Profile is null or empty");
    return;
  }
  var startTime = Date.now();
  var parseRequest = Parser.parse(rawProfile, {
    appendVideoCapture : gAppendVideoCapture,  
    profileId: profileId,
  });
  gVideoCapture = null;
  parseRequest.addEventListener("progress", function (progress, action) {
    if (action)
      reporter.setAction(action);
    reporter.setProgress(progress);
  });
  parseRequest.addEventListener("finished", function (result) {
    console.log("parsing (in worker): " + (Date.now() - startTime) + "ms");
    reporter.finish();
    gMeta = result.meta;
    gNumSamples = result.numSamples;
    gSymbols = result.symbols;
    gFunctions = result.functions;
    gResources = result.resources;
    enterFinishedProfileUI();
    gFileList.profileParsingFinished();
  });
}

var gImportFromAddonSubreporters = null;

window.addEventListener("message", function messageFromAddon(msg) {
  // This is triggered by the profiler add-on.
  var o = JSON.parse(msg.data);
  switch (o.task) {
    case "importFromAddonStart":
      var totalReporter = enterProgressUI();
      gImportFromAddonSubreporters = totalReporter.addSubreporters({
        import: 10000,
        parsing: 1000
      });
      gImportFromAddonSubreporters.import.begin("Symbolicating...");
      break;
    case "importFromAddonProgress":
      gImportFromAddonSubreporters.import.setProgress(o.progress);
      if (o.action != null) {
          gImportFromAddonSubreporters.import.setAction(o.action);
      }
      break;
    case "importFromAddonFinish":
      importFromAddonFinish(o.rawProfile);
      break;
  }
});

function importFromAddonFinish(rawProfile) {
  gImportFromAddonSubreporters.import.finish();
  loadRawProfile(gImportFromAddonSubreporters.parsing, rawProfile);
}

var gInvertCallstack = false;
function toggleInvertCallStack() {
  gTreeManager.saveReverseSelectionSnapshot(gJavascriptOnly);
  gInvertCallstack = !gInvertCallstack;
  var startTime = Date.now();
  viewOptionsChanged();
  console.log("invert time: " + (Date.now() - startTime) + "ms");
}

var gMergeUnbranched = false;
function toggleMergeUnbranched() {
  gMergeUnbranched = !gMergeUnbranched;
  viewOptionsChanged(); 
}

var gMergeFunctions = true;
function toggleMergeFunctions() {
  gMergeFunctions = !gMergeFunctions;
  filtersChanged(); 
}

var gJankOnly = false;
var gJankThreshold = 50 /* ms */;
function toggleJank(/* optional */ threshold) {
  // Currently we have no way to change the threshold in the UI
  // once we add this we will need to change the tooltip.
  gJankOnly = !gJankOnly;
  if (threshold != null ) {
    gJankThreshold = threshold;
  }
  filtersChanged();
}

var gJavascriptOnly = false;
function toggleJavascriptOnly() {
  if (gJavascriptOnly) {
    // When going from JS only to non js there's going to be new C++
    // frames in the selection so we need to restore the selection
    // while allowing non contigous symbols to be in the stack (the c++ ones)
    gTreeManager.setAllowNonContigous();
  }
  gJavascriptOnly = !gJavascriptOnly;
  gTreeManager.saveSelectionSnapshot(gJavascriptOnly);
  filtersChanged();
}

var gSampleFilters = [];
function focusOnSymbol(focusSymbol, name) {
  var newFilterChain = gSampleFilters.concat([{type: "FocusedFrameSampleFilter", name: name, focusedSymbol: focusSymbol}]);
  gBreadcrumbTrail.addAndEnter({
    title: name,
    enterCallback: function () {
      gSampleFilters = newFilterChain;
      filtersChanged();
    }
  });
}

function focusOnCallstack(focusedCallstack, name, overwriteCallstack) {
  var invertCallback =  gInvertCallstack;
  if (overwriteCallstack != null) {
    invertCallstack = overwriteCallstack;
  }
  var filter = {
    type: !invertCallstack ? "FocusedCallstackPostfixSampleFilter" : "FocusedCallstackPrefixSampleFilter",
    name: name,
    focusedCallstack: focusedCallstack,
    appliesToJS: gJavascriptOnly
  };
  var newFilterChain = gSampleFilters.concat([filter]);
  gBreadcrumbTrail.addAndEnter({
    title: name,
    enterCallback: function () {
      gSampleFilters = newFilterChain;
      filtersChanged();
    }
  })
}

function focusOnPluginView(pluginName, param) {
  var filter = {
    type: "PluginView",
    pluginName: pluginName,
    param: param,
  };
  var newFilterChain = gSampleFilters.concat([filter]);
  gBreadcrumbTrail.addAndEnter({
    title: "Plugin View: " + pluginName,
    enterCallback: function () {
      gSampleFilters = newFilterChain;
      filtersChanged();
    }
  })
}

function viewJSSource(sample) {
  var sourceView = new SourceView();
  sourceView.setScriptLocation(sample.scriptLocation);
  sourceView.setSource(gMeta.js.source[sample.scriptLocation.scriptURI]);
  gMainArea.appendChild(sourceView.getContainer());

}

function setHighlightedCallstack(samples, heaviestSample) {
  PROFILERTRACE("highlight: " + samples);
  gHighlightedCallstack = samples;
  gHistogramView.highlightedCallstackChanged(gHighlightedCallstack);
  if (!gInvertCallstack) {
    // Always show heavy
    heaviestSample = heaviestSample.clone().reverse();
  }
  gSampleBar.setSample(heaviestSample);
}

function enterMainUI() {
  var uiContainer = document.createElement("div");
  uiContainer.id = "ui";

  gFileList = new FileList();
  uiContainer.appendChild(gFileList.getContainer());

  //gFileList.addFile();
  gFileList.loadProfileListFromLocalStorage();

  gInfoBar = new InfoBar();
  uiContainer.appendChild(gInfoBar.getContainer());

  gMainArea = document.createElement("div");
  gMainArea.id = "mainarea";
  uiContainer.appendChild(gMainArea);
  document.body.appendChild(uiContainer);

  var profileEntryPane = document.createElement("div");
  profileEntryPane.className = "profileEntryPane";
  profileEntryPane.innerHTML = '' +
    '<h1>Upload your profile here:</h1>' +
    '<input type="file" id="datafile" onchange="loadProfileFile(this.files);">' +
    '<h1>Or, alternatively, enter your profile data here:</h1>' +
    '<textarea rows=20 cols=80 id=data autofocus spellcheck=false></textarea>' +
    '<p><button onclick="loadProfile(document.getElementById(\'data\').value);">Parse</button></p>' +
    '';

  gMainArea.appendChild(profileEntryPane);
}

function enterProgressUI() {
  var profileProgressPane = document.createElement("div");
  profileProgressPane.className = "profileProgressPane";

  var progressLabel = document.createElement("a");
  profileProgressPane.appendChild(progressLabel);

  var progressBar = document.createElement("progress");
  profileProgressPane.appendChild(progressBar);

  var totalProgressReporter = new ProgressReporter();
  totalProgressReporter.addListener(function (r) {
    var progress = r.getProgress();
    progressLabel.innerHTML = r.getAction();
    console.log("Action: " + r.getAction());
    if (isNaN(progress))
      progressBar.removeAttribute("value");
    else
      progressBar.value = progress;
  });

  gMainArea.appendChild(profileProgressPane);

  Parser.updateLogSetting();

  return totalProgressReporter;
}

function enterFinishedProfileUI() {
  saveProfileToLocalStorage();

  var finishedProfilePaneBackgroundCover = document.createElement("div");
  finishedProfilePaneBackgroundCover.className = "finishedProfilePaneBackgroundCover";

  var finishedProfilePane = document.createElement("table");
  var rowIndex = 0;
  var currRow;
  finishedProfilePane.style.width = "100%";
  finishedProfilePane.style.height = "100%";
  finishedProfilePane.border = "0";
  finishedProfilePane.cellPadding = "0";
  finishedProfilePane.cellSpacing = "0";
  finishedProfilePane.borderCollapse = "collapse";
  finishedProfilePane.className = "finishedProfilePane";
  setTimeout(function() {
    // Work around a webkit bug. For some reason the table doesn't show up
    // until some actions happen such as focusing this box
    var filterNameInput = document.getElementById("filterName");
    if (filterNameInput != null) {
      changeFocus(filterNameInput);
     }
  }, 100);

  gBreadcrumbTrail = new BreadcrumbTrail();
  currRow = finishedProfilePane.insertRow(rowIndex++);
  currRow.insertCell(0).appendChild(gBreadcrumbTrail.getContainer());

  gHistogramView = new HistogramView();
  currRow = finishedProfilePane.insertRow(rowIndex++);
  currRow.insertCell(0).appendChild(gHistogramView.getContainer());

  if (false && gLocation.indexOf("file:") == 0) {
    // Local testing for frameView
    gFrameView = new FrameView();
    currRow = finishedProfilePane.insertRow(rowIndex++);
    currRow.insertCell(0).appendChild(gFrameView.getContainer());
  }

  gDiagnosticBar = new DiagnosticBar();
  gDiagnosticBar.setDetailsListener(function(details) {
    if (details.indexOf("bug ") == 0) {
      window.open('https://bugzilla.mozilla.org/show_bug.cgi?id=' + details.substring(4));
    } else {
      var sourceView = new SourceView();
      sourceView.setText("Diagnostic", js_beautify(details));
      gMainArea.appendChild(sourceView.getContainer());
    }
  });
  currRow = finishedProfilePane.insertRow(rowIndex++);
  currRow.insertCell(0).appendChild(gDiagnosticBar.getContainer());

  // For testing:
  //gMeta.videoCapture = {
  //  src: "http://videos-cdn.mozilla.net/brand/Mozilla_Firefox_Manifesto_v0.2_640.webm",
  //};

  if (gMeta && gMeta.videoCapture) {
    gVideoPane = new VideoPane(gMeta.videoCapture);
    gVideoPane.onTimeChange(videoPaneTimeChange);
    currRow = finishedProfilePane.insertRow(rowIndex++);
    currRow.insertCell(0).appendChild(gVideoPane.getContainer());
  }

  var treeContainerDiv = document.createElement("div");
  treeContainerDiv.className = "treeContainer";
  treeContainerDiv.style.width = "100%";
  treeContainerDiv.style.height = "100%";

  gTreeManager = new ProfileTreeManager();
  currRow = finishedProfilePane.insertRow(rowIndex++);
  currRow.style.height = "100%";
  var cell = currRow.insertCell(0);
  cell.appendChild(treeContainerDiv);
  treeContainerDiv.appendChild(gTreeManager.getContainer());

  gSampleBar = new SampleBar();
  treeContainerDiv.appendChild(gSampleBar.getContainer());

  // sampleBar

  gPluginView = new PluginView();
  //currRow = finishedProfilePane.insertRow(4);
  treeContainerDiv.appendChild(gPluginView.getContainer());

  gMainArea.appendChild(finishedProfilePaneBackgroundCover);
  gMainArea.appendChild(finishedProfilePane);

  var currentBreadcrumb = gSampleFilters;
  gBreadcrumbTrail.add({
    title: "Complete Profile",
    enterCallback: function () {
      gSampleFilters = [];
      filtersChanged();
    }
  });
  if (currentBreadcrumb == null || currentBreadcrumb.length == 0) {
    gTreeManager.restoreSerializedSelectionSnapshot(gRestoreSelection);
    viewOptionsChanged();
  }
  for (var i = 0; i < currentBreadcrumb.length; i++) {
    var filter = currentBreadcrumb[i];
    var forceSelection = null;
    if (gRestoreSelection != null && i == currentBreadcrumb.length - 1) {
      forceSelection = gRestoreSelection;
    }
    switch (filter.type) {
      case "FocusedFrameSampleFilter":
        focusOnSymbol(filter.name, filter.symbolName);
        gBreadcrumbTrail.enterLastItem(forceSelection);
      case "FocusedCallstackPrefixSampleFilter":
        focusOnCallstack(filter.focusedCallstack, filter.name, false);
        gBreadcrumbTrail.enterLastItem(forceSelection);
      case "FocusedCallstackPostfixSampleFilter":
        focusOnCallstack(filter.focusedCallstack, filter.name, true);
        gBreadcrumbTrail.enterLastItem(forceSelection);
      case "RangeSampleFilter":
        gHistogramView.selectRange(filter.start, filter.end);
        gBreadcrumbTrail.enterLastItem(forceSelection);
    }
  }
}

// Make all focus change events go through this function.
// This function will mediate the focus changes in case
// that we're in a compare view. In a compare view an inactive
// instance of cleopatra should not steal focus from the active
// cleopatra instance.
function changeFocus(elem) {
  if (window.comparator_changeFocus) {
    window.comparator_changeFocus(elem);
  } else {
    dump("FOCUS\n\n\n\n\n\n\n\n\n");
    elem.focus();
  }
}

function comparator_receiveSelection(snapshot, frameData) {
  gTreeManager.restoreSerializedSelectionSnapshot(snapshot); 
  if (frameData)
    gTreeManager.highlightFrame(frameData);
  viewOptionsChanged();
}

function filtersChanged() {
  if (window.comparator_setSelection) {
  //  window.comparator_setSelection(gTreeManager.serializeCurrentSelectionSnapshot(), null);
  }
  updateDocumentURL();
  var data = { symbols: {}, functions: {}, samples: [] };

  gHistogramView.dataIsOutdated();
  var filterNameInput = document.getElementById("filterName");
  var updateRequest = Parser.updateFilters({
    mergeFunctions: gMergeFunctions,
    nameFilter: (filterNameInput && filterNameInput.value) || gQueryParamFilterName || "",
    sampleFilters: gSampleFilters,
    jankOnly: gJankOnly,
    javascriptOnly: gJavascriptOnly
  });
  var start = Date.now();
  updateRequest.addEventListener("finished", function (filteredSamples) {
    console.log("profile filtering (in worker): " + (Date.now() - start) + "ms.");
    gCurrentlyShownSampleData = filteredSamples;
    gInfoBar.display();

    if (gSampleFilters.length > 0 && gSampleFilters[gSampleFilters.length-1].type === "PluginView") {
      start = Date.now();
      gPluginView.display(gSampleFilters[gSampleFilters.length-1].pluginName, gSampleFilters[gSampleFilters.length-1].param,
                          gCurrentlyShownSampleData, gHighlightedCallstack);
      console.log("plugin displaying: " + (Date.now() - start) + "ms.");
    } else {
      gPluginView.hide();
    }
  });

  var histogramRequest = Parser.calculateHistogramData();
  histogramRequest.addEventListener("finished", function (data) {
    start = Date.now();
    gHistogramView.display(data.histogramData, data.frameStart, data.widthSum, gHighlightedCallstack);
    if (gFrameView)
      gFrameView.display(data.histogramData, data.frameStart, data.widthSum, gHighlightedCallstack);
    console.log("histogram displaying: " + (Date.now() - start) + "ms.");
  });

  var diagnosticsRequest = Parser.calculateDiagnosticItems(gMeta);
  diagnosticsRequest.addEventListener("finished", function (diagnosticItems) {
    start = Date.now();
    gDiagnosticBar.display(diagnosticItems);
    console.log("diagnostic items displaying: " + (Date.now() - start) + "ms.");
  });

  viewOptionsChanged();
}

function viewOptionsChanged() {
  gTreeManager.dataIsOutdated();
  var filterNameInput = document.getElementById("filterName");
  var updateViewOptionsRequest = Parser.updateViewOptions({
    invertCallstack: gInvertCallstack,
    mergeUnbranched: gMergeUnbranched
  });
  updateViewOptionsRequest.addEventListener("finished", function (calltree) {
    var start = Date.now();
    gTreeManager.display(calltree, gSymbols, gFunctions, gResources, gMergeFunctions, filterNameInput && filterNameInput.value);
    console.log("tree displaying: " + (Date.now() - start) + "ms.");
  });
}

function loadQueryData(queryData) {
  var isFiltersChanged = false;
  var queryDataOriginal = queryData;
  var queryData = {};
  for (var i in queryDataOriginal) {
    queryData[i] = unQueryEscape(queryDataOriginal[i]);
  }
  if (queryData.search) {
    gQueryParamFilterName = queryData.search;
    isFiltersChanged = true;
  }
  if (queryData.jankOnly) {
    gJankOnly = queryData.jankOnly;
    isFiltersChanged = true;
  }
  if (queryData.javascriptOnly) {
    gJavascriptOnly = queryData.javascriptOnly;
    isFiltersChanged = true;
  }
  if (queryData.mergeUnbranched) {
    gMergeUnbranched = queryData.mergeUnbranched;
    isFiltersChanged = true;
  }
  if (queryData.invertCallback) {
    gInvertCallstack = queryData.invertCallback;
    isFiltersChanged = true;
  }
  if (queryData.report) {
    gReportID = queryData.report;
  }
  if (queryData.filter) {
    var filterChain = JSON.parse(queryData.filter);
    gSampleFilters = filterChain;
  }
  if (queryData.selection) {
    var selection = queryData.selection;
    gRestoreSelection = selection;
  }

  if (isFiltersChanged) {
    //filtersChanged();
  }
}

function unQueryEscape(str) {
  return decodeURIComponent(str);
}

function queryEscape(str) {
  return encodeURIComponent(encodeURIComponent(str));
}

function updateDocumentURL() {
  location.hash = getDocumentHashString();
  return document.location;
}

function getDocumentHashString() {
  var query = "";
  if (gReportID) {
    if (query != "")
      query += "&";
    query += "report=" + queryEscape(gReportID);
  }
  if (document.getElementById("filterName") != null &&
      document.getElementById("filterName").value != null &&
      document.getElementById("filterName").value != "") {
    if (query != "")
      query += "&";
    query += "search=" + queryEscape(document.getElementById("filterName").value);
  }
  // For now don't restore the view rest
  return query;
  if (gJankOnly) {
    if (query != "")
      query += "&";
    query += "jankOnly=" + queryEscape(gJankOnly);
  }
  if (gJavascriptOnly) {
    if (query != "")
      query += "&";
    query += "javascriptOnly=" + queryEscape(gJavascriptOnly);
  }
  if (gMergeUnbranched) {
    if (query != "")
      query += "&";
    query += "mergeUnbranched=" + queryEscape(gMergeUnbranched);
  }
  if (gInvertCallstack) {
    if (query != "")
      query += "&";
    query += "invertCallback=" + queryEscape(gInvertCallstack);
  }
  if (gSampleFilters && gSampleFilters.length != 0) {
    if (query != "")
      query += "&";
    query += "filter=" + queryEscape(JSON.stringify(gSampleFilters));
  }
  if (gTreeManager.hasNonTrivialSelection()) {
    if (query != "")
      query += "&";
    query += "selection=" + queryEscape(gTreeManager.serializeCurrentSelectionSnapshot());
  }
  if (!gReportID) {
    query = "uploadProfileFirst!";
  }

  return query;
}

