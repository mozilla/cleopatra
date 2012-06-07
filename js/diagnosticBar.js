function DiagnosticBar() {
  this._container = document.createElement("div");
  this._container.className = "diagnostic";
  this._container.innerHTML = "DiagnosticBarContainer";
}

DiagnosticBar.prototype = {
  getContainer: function TreeView_getContainer() {
    return this._container;
  },
};


