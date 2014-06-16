function VideoPane(videoCapture, frameStart) {
  var qrScripts = [
    "grid.js",
    "version.js",
    "detector.js",
    "formatinf.js",
    "errorlevel.js",
    "bitmat.js",
    "datablock.js",
    "bmparser.js",
    "datamask.js",
    "rsdecoder.js",
    "gf256poly.js",
    "gf256.js",
    "decoder.js",
    "qrcode.js",
    "findpat.js",
    "alignpat.js",
    "databr.js"
  ];

  for (var i = 0; i < qrScripts.length; i++) {
    var scriptFile = qrScripts[i];
    var js = document.createElement("script");
    js.type = "text/javascript";
    js.src = "js/qr/jsqrcode/"+ scriptFile;
    document.body.appendChild(js);
  }

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
  this._video.addEventListener("play", function() {
    this.playbackRate = 0.05;
  });
  this._container.appendChild(this._video);

  this._canvas = document.createElement("canvas");
  this._canvas.id = "qr-canvas";
  this._canvas.style.display = "none";
  this._frameStart = frameStart;
  this._syncPoint = {};
  document.body.appendChild(this._canvas);

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
    var self = this;
    var number = null;

    if (this._canvas.width != this._video.videoWidth ||
        this._canvas.height != this._video.videoHeight) {
      this._canvas.width = this._video.videoWidth;
      this._canvas.height = this._video.videoHeight;  
    }

    var context = this._canvas.getContext("2d");
    context.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);
    
    // TODO patch library to accept an element
    qrcode.callback = function(data) {
      number = parseInt(data);
      self.foundFrame(number, self._frameStart[number], self._video.currentTime * 1000);
    }
    try {
      qrcode.decode();
    } catch (e) {
    }
    console.log("Frame: " + number);
    return number;
  },
  foundFrame: function VideoPane_foundFrame(frame, profileTime, videoTime) {
    profileTime = Math.round(profileTime);
    videoTime = Math.round(videoTime);
    this._syncPoint[profileTime] = {
      videoTime: videoTime,
      profileTime: profileTime,
      frame: frame,
    };
    console.log("Found frame: " + JSON.stringify(this._syncPoint));
  },
  getApproxTime: function VideoFrame_foundFramev(videoTime) {
    var self = this;
    videoTime = videoTime | (this._video.currentTime * 1000);

    var values = Object.keys(this._syncPoint);
    values.sort(function(a,b) {
      return self._syncPoint[a].videoTime - self._syncPoint[b].videoTime;
    });
    var currFrame = null;
    var frameReading = [];
    for (var i = 0; i < values.length; i++) {
      var entry = this._syncPoint[values[i]];
      if (currFrame != entry.frame) {
        currFrame = entry.frame;
        frameReading.push(entry);
      }
    }
    function prune() {
      for (var i = frameReading.length - 1; i >= 0; i--) {
        for (var j = i - 1; j >= 0; j--) {
          if (frameReading[i].frame < frameReading[j].frame) {
            frameReading = frameReading.slice(i);
            return;
          }
        }
      }
    }
    // Prune data we wrapped around
    prune();

    if (frameReading.length < 1) {
      return null;
    }

    var offset = frameReading[frameReading.length - 1].videoTime - frameReading[frameReading.length - 1].profileTime;

    return videoTime - offset;
  },
};

