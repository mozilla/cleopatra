function VideoPane() {
  this._container = document.createElement("div");
  this._container.className = "videoPane";
  this._onTimeChange = null;

  this._video = document.createElement("video");
  this._video.className = "video";
  this._video.width = 480;
  this._video.controls = "controls";
  this._video.src = "http://videos-cdn.mozilla.net/brand/Mozilla_Firefox_Manifesto_v0.2_640.webm";
  this._container.appendChild(this._video);

  //this._container.innerHTML = "<center><video width=300 height=300 controls=controls><source src='http://videos-cdn.mozilla.net/brand/Mozilla_Firefox_Manifesto_v0.2_640.webm' type='video/webm' /></video></center>";
}

VideoPane.prototype = {
  getContainer: function VideoPane_getContainer() {
    return this._container;
  },
  onTimeChange: function VideoPane_onTimeChange(callback) {
    var self = this;
    this._video.addEventListener("timeupdate", function() {
      callback(self._video);
    });
  }
};

