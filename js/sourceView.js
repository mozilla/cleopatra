

function SourceView() {
  this._container = document.createElement("div");
  this._container.className = "sourceViewContainer";

  this._buttonBar = document.createElement("div");
  this._buttonBar.className = "sourceViewTrail";
  this._closeButton = document.createElement("div");
  this._closeButton.className = "sourceViewTrailItem";
  this._closeButton.innerHTML = "[X] Close";
  var self = this;
  this._closeButton.onclick = function() {
    self._container.parentNode.removeChild(self._container);
  }
  this._buttonBar.appendChild(this._closeButton);
  this._container.appendChild(this._buttonBar);
}

SourceView.prototype = {
  getContainer: function SourceView_getContainer() {
    return this._container;
  },

  setSource: function SourceView_setSource(source) {
    this._source = source; 
  }
}

