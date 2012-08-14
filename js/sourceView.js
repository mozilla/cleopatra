var escape = document.createElement('textarea');

function escapeHTML(html) {
  escape.innerHTML = html;
  return escape.innerHTML;
}

function unescapeHTML(html) {
  escape.innerHTML = html;
  return escape.value;
}

function replaceAll(txt, replace, with_this) {
    return txt.replace(new RegExp(replace, 'g'),with_this);
}

function formatStrSpacing(str) {
  str = replaceAll(str, "&", "&amp;");
  str = replaceAll(str, "<", "&lt;");
  str = replaceAll(str, ">", "&gt;");
  str = replaceAll(str, " ", "&nbsp;");
  str = replaceAll(str, "\t", "&nbsp;&nbsp;&nbsp;&nbsp;");
  return str;
}

function SourceView() {
  this._container = document.createElement("div");
  this._container.className = "sourceViewContainer";

  this._buttonBar = document.createElement("div");
  this._buttonBar.className = "sourceViewTrail";

  this._closeButton = document.createElement("div");
  this._closeButton.className = "sourceViewTrailItem";
  this._closeButton.innerHTML = "[X] Close";
  this._buttonBar.appendChild(this._closeButton);

  this._documentTitle = document.createElement("div");
  this._documentTitle.className = "sourceViewTrailItem";
  this._documentTitle.innerHTML = "";
  this._buttonBar.appendChild(this._documentTitle);

  this._source = null; // String
  this._sourceLines = null; // String array
  this._sourceLinesObj = null; // String array
  this._sourceDiv = document.createElement("div");

  var self = this;
  this._closeButton.onclick = function() {
    self._container.parentNode.removeChild(self._container);
  }

  this._container.appendChild(this._buttonBar);
  this._container.appendChild(this._sourceDiv);
}

SourceView.prototype = {
  getContainer: function SourceView_getContainer() {
    return this._container;
  },

  setSource: function SourceView_setSource(source) {
    this._source = source;
    this._sourceLines = source.split('\n');
    this._sourceLinesObj = [];
    for (var i = 0; i < this._sourceLines.length; i++) {
      var lineCountDiv = document.createElement("span");
      //lineCountDiv.innerHTML = "0 | ";
      var lineTextDiv = document.createElement("span"); 
      lineTextDiv.innerHTML = formatStrSpacing(this._sourceLines[i]);
      var lineBreak = document.createElement("br"); 
      this._sourceDiv.appendChild(lineCountDiv);
      this._sourceDiv.appendChild(lineTextDiv);
      this._sourceDiv.appendChild(lineBreak);
      this._sourceLinesObj.push( [lineCountDiv, lineTextDiv] );
    }
  },

  setScriptLocation: function SourceView_setScriptLocation(scriptLocation) {
    dump("View source: " + scriptLocation.lineInformation + "\n");
    this._documentTitle.textContent = scriptLocation.scriptURI;
    this._scriptLocation = scriptLocation;
  },
}

