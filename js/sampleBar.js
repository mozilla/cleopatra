'use strict';

(function(window) {
  function SampleBar() {
    this._container = document.createElement("div");
    this._container.id = "sampleBar";
    this._container.className = "sideBar";

    this._header = document.createElement("h2");
    this._header.innerHTML = "Selection - Most time spent in:";
    this._header.alt = "This shows the heaviest leaf of the selected sample. Use this to get a quick glimpse of where the selection is spending most of its time.";
    this._container.appendChild(this._header);

    this._text = document.createElement("ul");
    this._text.style.whiteSpace = "pre";
    this._text.innerHTML = "Sample text";
    this._container.appendChild(this._text);
  }

  SampleBar.prototype = {
    getContainer: function SampleBar_getContainer() {
      return this._container;
    },
    setSample: function SampleBar_setSample(sample) {
      var str = "";
      var list = [];

      this._text.innerHTML = "";

      for (var i = 0; i < sample.length; i++) {
        var functionObj = gMergeFunctions ? gFunctions[sample[i]] : gFunctions[symbols[sample[i]].functionIndex];
        if (!functionObj)
          continue;
        var functionItem = document.createElement("li");
        var functionLink = document.createElement("a");
        functionLink.textContent = functionLink.title = functionObj.functionName;
        functionLink.href = "#";
        functionItem.appendChild(functionLink);
        this._text.appendChild(functionItem);
        list.push(functionObj.functionName);
        functionLink.selectIndex = i;
        functionLink.onclick = function() {
          var selectedFrames = [];
          if (gInvertCallstack) {
            for (var i = 0; i <= this.selectIndex; i++) {
              var functionObj = gMergeFunctions ? gFunctions[sample[i]] : gFunctions[symbols[sample[i]].functionIndex];
              selectedFrames.push(functionObj.functionName);
            }
          } else {
            for (var i = sample.length - 1; i >= this.selectIndex; i--) {
              var functionObj = gMergeFunctions ? gFunctions[sample[i]] : gFunctions[symbols[sample[i]].functionIndex];
              selectedFrames.push(functionObj.functionName);
            }
          }
          gTreeManager.setSelection(selectedFrames);
          return false;
        }
      }
      return list;
    }
  }

  window.SampleBar = SampleBar;
}(this));
