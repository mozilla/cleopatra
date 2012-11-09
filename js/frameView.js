function FrameView() {
  this._container = document.createElement("div");
  this._container.className = "frameViewContainer";

  this._canvas = this._createSvg();
  this._container.appendChild(this._canvas);
}

FrameView.prototype = {
  getContainer: function SourceView_getContainer() {
    return this._container;
  },
  _createSvg: function HistogramView__createSvg() {
    var canvas = document.createElement("svg");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    return canvas;
  },
};

