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
          || stepContains('stat$INODE64', frames, symbols)
          ;
    },
  },

  {
    image: "js.png",
    title: "Bug 772916 - Gradients are slow on mobile",
    check: function(frames, symbols, meta) {

      return stepContains('PaintGradient', frames, symbols)
          && stepContains('BasicTiledLayerBuffer::PaintThebesSingleBufferDraw', frames, symbols)
          ;
    },
  },
  {
    image: "js.png",
    title: "Bug 789193 - AMI_startup() takes 200ms on startup",
    check: function(frames, symbols, meta) {

      return stepContains('AMI_startup()', frames, symbols)
          ;
    },
  },
  {
    image: "js.png",
    title: "Bug 789185 - LoginManagerStorage_mozStorage.init() takes 300ms on startup ",
    check: function(frames, symbols, meta) {

      return stepContains('LoginManagerStorage_mozStorage.init()', frames, symbols)
          ;
    },
  },

  {
    image: "js.png",
    title: "JS - Bug 767070 - Text selection performance is bad on android",
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
      return symbolSequence(['js::RunScript','layout::DoReflow'], frames, symbols)
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
        dump("Found\n");
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
          || stepContains('CycleCollect__', frames, symbols) // Label
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
          || stepContains('storage:::Statement::ExecuteStep', frames, symbols) 
          || stepContains('__unlink', frames, symbols) 
          || stepContains('fsync', frames, symbols) 
          || stepContains('stat$INODE64', frames, symbols)
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
function stepContains(substring, frames, symbols) {
  for (var i = 0; frames && i < frames.length; i++) {
    var frameSym = symbols[frames[i]].functionName || symbols[frames[i]].symbolName;
    if (frameSym.indexOf(substring) != -1) {
      return true;
    }
  }
  return false;
}
function stepContainsRegEx(regex, frames, symbols) {
  for (var i = 0; frames && i < frames.length; i++) {
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

function DiagnosticBar() {
  this._container = document.createElement("div");
  this._container.className = "diagnostic";
  this._colorCode = 0;
}

DiagnosticBar.prototype = {
  getContainer: function DiagnosticBar_getContainer() {
    return this._container;
  },
  setDetailsListener: function(callback) {
    this._detailsListener = callback;
  },
  _addDiagnosticItem: function(x, width, imageFile, title, details, onclickDetails) {
    var self = this;
    x = x * 100;
    width = width * 100;
    if (width < 1)
      return false;
    var diagnostic = document.createElement("a");

    var backgroundImageStr = "url('images/diagnostic/"+imageFile+"')";

    if (this._colorCode % 2 == 0) {
      backgroundImageStr += ", -moz-linear-gradient(#900, #E00)";
    } else {
      backgroundImageStr += ", -moz-linear-gradient(#300, #500)";
    }

    diagnostic.style.position = "absolute";
    diagnostic.style.backgroundImage = backgroundImageStr;
    diagnostic.style.width = width + "%";
    diagnostic.style.height = "100%";
    diagnostic.style.backgroundRepeat = "no-repeat";
    diagnostic.style.backgroundPosition = "center";

    diagnostic.title = title + (details?"\n"+details:"");
    diagnostic.style.left = x + "%";

    if (onclickDetails) {
      diagnostic.onclick = function() {
        if (self._detailsListener) {
          self._detailsListener(onclickDetails);
        }
      };
    }
    this._container.appendChild(diagnostic);

    this._colorCode++;

    return true;
  },
  _calculateDiagnosticItems: function DiagnosticBar__calculateDiagnosticItems(meta, data, filterByName, histogramData, symbols) {
    if (!histogramData || histogramData.length < 1)
      return [];

    var lastStep = data[data.length-1];
    var widthSum = data.length;
    var pendingDiagnosticInfo = null;

    var diagnosticItems = [];

    function finishPendingDiagnostic(endX) {
      if (!pendingDiagnosticInfo)
        return;

      diagnosticItems.push({
        x: pendingDiagnosticInfo.x / widthSum,
        width: (endX - pendingDiagnosticInfo.x) / widthSum,
        imageFile: pendingDiagnosticInfo.diagnostic.image,
        title: pendingDiagnosticInfo.diagnostic.title,
        details: pendingDiagnosticInfo.details,
        onclickDetails: pendingDiagnosticInfo.onclickDetails
      });
      pendingDiagnosticInfo = null;
    }

/*
    dump("meta: " + meta.gcStats + "\n");
    if (meta && meta.gcStats) {
      dump("GC Stats: " + JSON.stringify(meta.gcStats) + "\n");
    }
*/

    data.forEach(function diagnoseStep(step, x) {
      if (!step)
        return;

      var frames = step.frames;

      var diagnostic = firstMatch(diagnosticList, function (diagnostic) {
        return diagnostic.check(frames, symbols, meta, step);
      });

      if (!diagnostic) {
        finishPendingDiagnostic(x);
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
        finishPendingDiagnostic(x);
      }

      pendingDiagnosticInfo = {
        diagnostic: diagnostic,
        x: x,
        details: details,
        onclickDetails: diagnostic.onclickDetails ? diagnostic.onclickDetails(frames, symbols, meta, step) : null
      };
    });
    if (pendingDiagnosticInfo)
      finishPendingDiagnostic(data.length);

    return diagnosticItems;
  },
  display: function DiagnosticBar_display(meta, data, filterByName, histogramData, symbols) {
    var self = this;
    this._container.innerHTML = "";

    var diagnosticItems = this._calculateDiagnosticItems(meta, data, filterByName, histogramData, symbols);
    console.log(diagnosticItems);
    var addedAnyDiagnosticItem = diagnosticItems.map(function addOneItem(item) {
      return self._addDiagnosticItem(item.x, item.width, item.imageFile, item.title, item.details, item.onclickDetails);
    }).some(function (didAdd) { return didAdd; });

    if (!addedAnyDiagnosticItem) {
      this._container.style.display = "none";
    } else {
      this._container.style.display = "";
    }
    //this._container.innerHTML = w; //JSON.stringify(histogramData);
  },
};


