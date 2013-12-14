'use strict';

(function(window) {
  function PluginView() {
    this._container = document.createElement("div");
    this._container.className = "pluginview";
    this._container.style.visibility = 'hidden';
    this._iframe = document.createElement("iframe");
    this._iframe.className = "pluginviewIFrame";
    this._container.appendChild(this._iframe);
    this._container.style.top = "";
  }
  PluginView.prototype = {
    getContainer: function PluginView_getContainer() {
      return this._container;
    },
    hide: function() {
      // get rid of the scrollbars
      this._container.style.top = "";
      this._container.style.visibility = 'hidden';
    },
    show: function() {
      // This creates extra scrollbar so only do it when needed
      this._container.style.top = "0px";
      this._container.style.visibility = '';
    },
    display: function(pluginName, param, data) {
      this._iframe.src = "js/plugins/" + pluginName + "/index.html";
      var self = this;
      this._iframe.onload = function() {
        self._iframe.contentWindow.initCleopatraPlugin(data, param, gSymbols);
      }
      this.show();
    },
  };

  window.PluginView = PluginView;
}(this));
