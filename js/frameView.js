function FrameView() {
  this._container = document.createElement("div");
  this._container.className = "frameViewContainer";

  this._busyCover = document.createElement("div");
  this._busyCover.className = "busyCover";
  this._container.appendChild(this._busyCover);

  this._canvas = this._createSvg();
  this._container.appendChild(this._canvas);
}

FrameView.prototype = {
  getContainer: function SourceView_getContainer() {
    return this._container;
  },
  _createSvg: function SourceView__createSvg() {
    var canvas = document.createElement("svg");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    return canvas;
  },
  dataIsOutdated: function HistogramView_dataIsOutdated() {
    this._busyCover.classList.add("busy");
  },
  display: function SourceView_display(histogramData, frameStart, widthSum, highlightedCallstack) {
    //this._busyCover.classList.remove("busy");
  },
};

