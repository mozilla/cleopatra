var diagnosticList = [
  {
    image: "js.png",
    title: "Javascript",
    check: function() {
      return true;
    },
  },
];

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
  display: function DiagnosticBar_display(data, filterByName, histogramData) {
    this._container.innerHTML = "";
    console.log(histogramData);
    if (!histogramData || histogramData.length < 1) return;

    var lastStep = histogramData[histogramData.length-1];
    var widthSum = lastStep.x + lastStep.width;
    console.log(" " + widthSum);
    var self = this;
    var count = 0;
    histogramData.forEach(function plotStep(step) {
      console.log(step.width + " " + widthSum);
      if (step.width / widthSum > 0.05) {
        for (var i = 0; i < diagnosticList.length; i++) {
          var currDiagnostic = diagnosticList[i];
          if (currDiagnostic.check()) {
            var imgFile = currDiagnostic.image;
            var title = currDiagnostic.title;
            self._addDiagnosticItem(step.x/widthSum*100, Math.ceil(step.width/widthSum*100), imgFile, title);
            count++;
            break;
          }
        }
      }
    });
    if (count == 0) {
      this._container.style.display = "none";
    } else {
      this._container.style.display = "";
    }
    //this._container.innerHTML = w; //JSON.stringify(histogramData);
  },
};


