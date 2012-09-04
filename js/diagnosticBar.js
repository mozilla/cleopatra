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
        dump("found event matching diagnostic\n");
        dump(JSON.stringify(gcEvent) + "\n");
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
          "Pause: " + slice.pause;
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
    if (width < 1) return 0;
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
      dump("onclick list\n\n\n\n\n\n\n\n\n\n");
      diagnostic.onclick = function() {
        dump("onclick\n");
        if (self._detailsListener) {
          self._detailsListener(onclickDetails);
        }
      };
    }
    this._container.appendChild(diagnostic);

    this._colorCode++;

    return 1;
  },
  display: function DiagnosticBar_display(meta, data, filterByName, histogramData, symbols) {
    this._container.innerHTML = "";
    if (!histogramData || histogramData.length < 1) return;

    var lastStep = data[data.length-1];
    var widthSum = data.length;
    var self = this;
    var count = 0;
    var pendingDiagnosticX = null;
    var pendingDiagnosticW = null;
    var pendingDiagnostic = null;
    var pendingDiagnosticInfo = {};

    var x = 0;

    //dump("meta: " + meta.gcStats + "\n");
    if (meta && meta.gcStats) {
      //dump("GC Stats: " + JSON.stringify(meta.gcStats) + "\n");
    }
    data.forEach(function plotStep(step) {
      if (!step) {
        // Add a gap for the sample that was filtered out.
        x++;
        return;
      }

      var frames = step.frames;
      var needFlush = true;
      for (var i = 0; i < diagnosticList.length; i++) {
        var currDiagnostic = diagnosticList[i];
        if (currDiagnostic.check(frames, symbols, meta, step)) {
          var details = null;
          if (currDiagnostic.details) {
            details = currDiagnostic.details(frames, symbols, meta, step);
          }
          if (pendingDiagnostic && (pendingDiagnostic != currDiagnostic || pendingDiagnosticInfo.details != details)) {
            var imgFile = pendingDiagnostic.image;
            var title = pendingDiagnostic.title;
            var pendingDetails = pendingDiagnosticInfo.details;
            var onclickDetails = pendingDiagnosticInfo.onclickDetails;
            count += self._addDiagnosticItem(pendingDiagnosticX/widthSum, pendingDiagnosticW/widthSum,
                                             imgFile, title, pendingDetails, onclickDetails);
            pendingDiagnostic = null;
          }
          if (!pendingDiagnostic) {
            pendingDiagnostic = currDiagnostic;
            pendingDiagnosticX = x;
            pendingDiagnosticW = 1;
            if (step.extraInfo && step.extraInfo.time) {
              pendingDiagnosticInfo.start = step.extraInfo.time;
            }
            pendingDiagnosticInfo.details = details;
            if (currDiagnostic.onclickDetails)
              pendingDiagnosticInfo.onclickDetails = currDiagnostic.onclickDetails(frames, symbols, meta, step);
          } else if (pendingDiagnostic && pendingDiagnostic == currDiagnostic) {
            pendingDiagnosticW++;
          }
          needFlush = false;
          break;
        }
      }
      x++;
    });
    if (pendingDiagnostic) {
      var imgFile = pendingDiagnostic.image;
      var title = pendingDiagnostic.title;
      var pendingDetails = pendingDiagnosticInfo.details;
      var onclickDetails = pendingDiagnosticInfo.onclickDetails;
      count += self._addDiagnosticItem(pendingDiagnosticX/widthSum, pendingDiagnosticW/widthSum,
                                       imgFile, title, pendingDetails, onclickDetails);
      pendingDiagnostic = null;
    }
    if (count == 0) {
      this._container.style.display = "none";
    } else {
      this._container.style.display = "";
    }
    //this._container.innerHTML = w; //JSON.stringify(histogramData);
  },
};


