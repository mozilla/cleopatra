function VideoPane(videoCapture) {
  this._container = document.createElement("div");
  this._container.className = "videoPane";
  this._onTimeChange = null;

  this._video = document.createElement("video");
  this._video.className = "video";
  //this._video.width = 480;
  this._video.controls = "controls";
  this._video.crossOrigin = 'anonymous';
  this._video.crossorigin = 'anonymous';
  this._video.src = videoCapture.src;
  this._container.appendChild(this._video);

  this._canvas = document.createElement("canvas");

  // When we get a time update we fire a callback because
  // the updated frame might not have been ready.
  this._timeUpdateCallback = null;
}

VideoPane.prototype = {
  getContainer: function VideoPane_getContainer() {
    return this._container;
  },
  onTimeChange: function VideoPane_onTimeChange(callback) {
    var self = this;
    this._video.addEventListener("timeupdate", function() {
      callback(self._video);
      if (self._timeUpdateCallback) {
        clearTimeout(self._timeUpdateCallback);
      }
      self._timeUpdateCallback = setTimeout(function timeUpdateCallback() {
        callback(self._video);
        self._timeUpdateCallback = null;
      }, 100);
    });
  },
  getCurrentFrameNumber: function VideoPane_getCurrentFrameNumber() {
    if (this._canvas.width != this._video.videoWidth ||
        this._canvas.height != this._video.videoHeight) {
      this._canvas.width = this._video.videoWidth;
      this._canvas.height = this._video.videoHeight;  
    }

    var context = this._canvas.getContext("2d");
    context.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);
    var frame = context.getImageData(0, 0, this._canvas.width, this._canvas.height);

    var TOLERENCE = 50;
    var frameNumber = 0;
    for (var i = 0; i < 16; i++) {
      var currColor = null;
      // Look for each frame counter bit, a 3x3 black/white dot
      // sample only from the top middle pixel since it has the lowest chance of compression leakage
      for (var x = 1; x < 2; x++) {
        for (var y = 0; y < 1; y++) {
          var r = frame.data[(i*3 + x + y*this._canvas.width) * 4 + 0]; 
          var g = frame.data[(i*3 + x + y*this._canvas.width) * 4 + 1]; 
          var b = frame.data[(i*3 + x + y*this._canvas.width) * 4 + 2]; 
          if (currColor != "white" && r < TOLERENCE && g < TOLERENCE && b < TOLERENCE) {
            currColor = "black";
          } else if (currColor != "black" && r > 255 - TOLERENCE && g > 255 - TOLERENCE && b > 255 - TOLERENCE) {
            currColor = "white";
          } else {
            //var data = this._canvas.toDataURL();
            //dump("Fail to find frame: " + data + "\n");
            //dump("i: " + i + "\n");
            //dump("x: " + x + "\n");
            //dump("y: " + y + "\n");
            //dump("R: " + r + " G: " + g + " B: " + b + "\n");
            //dump("Fail\n");
            return null;
          }
        }
      }
      if (currColor == "black") {
        frameNumber += 1 << i;
      }
    }
    return frameNumber;
  }
};

