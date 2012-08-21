function VideoPane(videoCapture) {
  this._container = document.createElement("div");
  this._container.className = "videoPane";
  this._onTimeChange = null;

  this._video = document.createElement("video");
  this._video.className = "video";
  this._video.width = 480;
  this._video.controls = "controls";
  this._video.src = videoCapture.src;
  this._container.appendChild(this._video);
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

