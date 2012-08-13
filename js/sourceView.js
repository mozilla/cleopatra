

function SourceView() {
  this._container = document.createElement("div");
  this._container.className = "sourceViewContainer";

  this._container.innerHTML = "View source test";
}

SourceView.prototype = {
  getContainer: function SourceView_getContainer() {
    return this._container;
  },
}

