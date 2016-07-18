function RemoteView(url, data) {
  var self = this;

  this.url = url;
  this.data = data;

  this._container = createElement("iframe", {
    src: url,
    style: {
      width: "100%",
      height: "100%",
    },
    onload: function() {
      self.remoteWindow = self._container.contentWindow;
      self.remoteWindow.postMessage({
        name: "Cleopatra::LoadData",
        data: data,
      }, "*");
    },
  });

}

RemoteView.prototype = {
  url: null,
  data: null,
  _container: null,
  remoteWindow: null,

  getContainer: function() {
    return this._container;
  }
}

