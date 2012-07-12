var diagnosticList = [
  // *************** Known bugs first (highest priority)
  {
    image: "io.png",
    title: "Main Thread IO - Bug 765135 - TISCreateInputSourceList",
    check: function(frames, symbols) {

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
    title: "JS - Bug 765930 - Reader Mode: Optimize readability check",
    check: function(frames, symbols) {

      return stepContains('Readability.js', frames, symbols) 
          ;
    },
  },

  // **************** General issues
  {
    image: "gc.png",
    title: "Garbage Collection",
    check: function(frames, symbols) {
      return stepContains('GCCycle', frames, symbols)
          || stepContains('GarbageCollectNow', frames, symbols) // Label
          || stepContains('CycleCollect', frames, symbols) // Label
          ;
    },
  },
  {
    image: "plugin.png",
    title: "Sync Plugin Constructor",
    check: function(frames, symbols) {
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
    check: function(frames, symbols) {
      return stepContains('gfxFontGroup::BuildFontList', frames, symbols);
    },
  },
  {
    image: "io.png",
    title: "Main Thread IO!",
    check: function(frames, symbols) {
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

function stepContains(substring, frames, symbols) {
  for (var i = 0; i < frames.length; i++) {
    var frameSym = symbols[frames[i]].functionName || symbols[frames[i]].symbolName;
    if (frameSym.indexOf(substring) != -1) {
      return true;
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
  _addDiagnosticItem: function(x, width, imageFile, title) {
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

    diagnostic.title = title;
    diagnostic.style.left = x + "%";
    this._container.appendChild(diagnostic);

    this._colorCode++;

    return 1;
  },
  display: function DiagnosticBar_display(data, filterByName, histogramData, symbols) {
    this._container.innerHTML = "";
    if (!histogramData || histogramData.length < 1) return;

    var lastStep = data[data.length-1];
    var widthSum = data.length;
    var self = this;
    var count = 0;
    var pendingDiagnosticX = null;
    var pendingDiagnosticW = null;
    var pendingDiagnostic = null;

    var x = 0;
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
        if (currDiagnostic.check(frames, symbols)) {
          if (pendingDiagnostic && pendingDiagnostic != currDiagnostic) {
            var imgFile = pendingDiagnostic.image;
            var title = pendingDiagnostic.title;
            count += self._addDiagnosticItem(pendingDiagnosticX/widthSum, pendingDiagnosticW/widthSum, imgFile, title);
            pendingDiagnostic = null;
          }
          if (!pendingDiagnostic) {
            pendingDiagnostic = currDiagnostic;
            pendingDiagnosticX = x;
            pendingDiagnosticW = 1;
          } else if (pendingDiagnostic && pendingDiagnostic == currDiagnostic) {
            pendingDiagnosticW++;
          }
          needFlush = false;
          break;
        }
      }
      if (needFlush && pendingDiagnostic) {
        var imgFile = pendingDiagnostic.image;
        var title = pendingDiagnostic.title;
        count += self._addDiagnosticItem(pendingDiagnosticX/widthSum, pendingDiagnosticW/widthSum, imgFile, title);
        pendingDiagnostic = null;
      }
      x++;
    });
    if (pendingDiagnostic) {
      var imgFile = pendingDiagnostic.image;
      var title = pendingDiagnostic.title;
      count += self._addDiagnosticItem(pendingDiagnosticX/widthSum, pendingDiagnosticW/widthSum, imgFile, title);
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


