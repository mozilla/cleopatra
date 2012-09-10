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
  display: function DiagnosticBar_display(diagnosticItems) {
    var self = this;
    this._container.innerHTML = "";

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


