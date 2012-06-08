var diagnosticList = [
  {
    image: "js.png",
    title: "Javascript",
    check: function(frames, symbols) {
      return stepContains('mach_msg', frames, symbols);
    },
  },
];

function stepContains(substring, frames, symbols) {
  //console.log("step: " + JSON.stringify(symbols));
  dump("start\n");
  for (var i = 0; i < frames.length; i++) {
    var frameSym = symbols[frames[i]].symbolName;
    dump("step: " + JSON.stringify(frameSym) + "\n");
  }
  for (var i = 0; i < frames.length; i++) {
    var frameSym = symbols[frames[i]].symbolName;
    if (frameSym.indexOf(substring) != -1) {
      return true;
    }
  }

}

function sameArray(arr1, arr2) {
  if (arr1.length != arr2.length) {
    console.log("Diff len: " + arr1.length + " " + arr2.length);
    return false;
  }

  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] != arr2[i]) {
      console.log("Diff: " + arr1[i] + " " + arr2[i]);
      return false;
    }
  }

  return true;
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
    if (width < 1) return;
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
  },
  display: function DiagnosticBar_display(data, filterByName, histogramData, symbols) {
    this._container.innerHTML = "";
    //console.log("SYM: " + JSON.stringify(symbols));
    if (!histogramData || histogramData.length < 1) return;

    var lastStep = histogramData[histogramData.length-1];
    var widthSum = lastStep.x + lastStep.width;
    var self = this;
    var count = 0;
    var pendingDiagnosticX = null;
    var pendingDiagnosticW = null;
    var pendingDiagnostic = null;
    console.log("Check");
    dump("numb of steps: " + histogramData.length + "\n");

    histogramData.forEach(function plotStep(step) {
      var pos = 0;
      while (pos < step.frames.length) {
        if (pos+1 == step.frames.length || !sameArray(step.frames[pos], step.frames[pos+1])) {
          // End of frame series
          var frames = step.frames[pos];
          var needFlush = true;
          for (var i = 0; i < diagnosticList.length; i++) {
            var currDiagnostic = diagnosticList[i];
            if (currDiagnostic.check(step.frames[pos], symbols)) {
              if (pendingDiagnostic && pendingDiagnostic != currDiagnostic) {
                console.log("flush");
                var imgFile = pendingDiagnostic.image;
                var title = pendingDiagnostic.title;
                self._addDiagnosticItem(pendingDiagnosticX, pendingDiagnosticW, imgFile, title);
                count++;
                pendingDiagnostic = null;
              }
              if (!pendingDiagnostic) {
                pendingDiagnostic = currDiagnostic;
                pendingDiagnosticX = step.x/widthSum*100;
                pendingDiagnosticW = step.width/widthSum*100;
              } else if (pendingDiagnostic == currDiagnostic) {
                console.log("Extend");
                pendingDiagnosticW = step.x/widthSum*100 + step.width/widthSum*100 - pendingDiagnosticX;
              }
              needFlush = false;
              break;
            }
          }
          if (needFlush && pendingDiagnostic) {
            var imgFile = pendingDiagnostic.image;
            var title = pendingDiagnostic.title;
            self._addDiagnosticItem(pendingDiagnosticX, pendingDiagnosticW, imgFile, title);
            count++;
            pendingDiagnostic = null;
          }
        }
        pos++;
      }
    });
    if (pendingDiagnostic) {
      console.log("final flush");
      var imgFile = pendingDiagnostic.image;
      var title = pendingDiagnostic.title;
      self._addDiagnosticItem(pendingDiagnosticX, pendingDiagnosticW, imgFile, title);
      count++;
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


