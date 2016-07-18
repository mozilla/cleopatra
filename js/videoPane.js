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
  this._video.crossOrigin = 'anonymous';
  this._video.crossorigin = 'anonymous';
  this._video.addEventListener("play", function() {
    //this.playbackRate = 0.05;
  });
  this._container.appendChild(this._video);

  this._video.addEventListener("loadeddata", function canplayfunc() {
    self._video.currentTime += 0.1;
    self._video.removeEventListener("loadeddata", canplayfunc);
  });
  this._videoUrl = videoCapture.src;
  this._video.src = this._videoUrl;

  this._canvas = document.createElement("canvas");
  this._canvas.id = "qr-canvas";
  this._canvas.style.display = "none";
  this._frameStart = frameStart;
  this._syncPoint = {};
  document.body.appendChild(this._canvas);

  this._busyCover = document.createElement("div");
  this._busyCover.className = "busyCover";
  this._busyCover.id = "videoCover";
  this._container.appendChild(this._busyCover);

  // When this is true we're reading back the video stream
  this._reading = true;
  this._busyCover.classList.add("busy");
  var self = this;
  self._video.addEventListener("seeked", function seekedfunc() {
    if (self._reading) {
      self.getCurrentFrameNumber();
      var prevTime = self._video.currentTime;
      self._video.currentTime += 0.016 * 5;
      if (self._video.currentTime == prevTime) {
        self._busyCover.classList.remove("busy");
        self._reading = false;
        self._video.controls = "controls";
        self._lockTimeToBound();
      }
    } else {
      console.log("seeked");
    }
  });

  // When we get a time update we fire a callback because
  // the updated frame might not have been ready.
  this._timeUpdateCallback = null;
}

VideoPane.prototype = {
  getContainer: function VideoPane_getContainer() {
    return this._container;
  },
  _lockTimeToBound: function() {
    if (this._reading)
      return;
    var newTime = null;
    if (this._video.currentTime * 1000 < this.minBound) {
      newTime = this.minBound / 1000;
    } else if (this._video.currentTime * 1000 > this.maxBound) {
      newTime = this.maxBound / 1000;
      if (this._video.paused == false) {
        // loop back
        newTime = this.minBound / 1000;
      }
    }
    if (newTime && newTime >= 0 && newTime < this._video.duration) {
      this._video.currentTime = newTime;
    }
  },
  onTimeChange: function VideoPane_onTimeChange(callback) {
    var self = this;
    this._video.addEventListener("timeupdate", function() {
      if (self._reading)
        return;
      self._lockTimeToBound();
      callback(self._video);
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
    return number;
  },
  setBoundaries: function VideoPane_setBounadries(boundaries) {
    var min = boundaries.min;
    var max = boundaries.max;

    var startStr = "";
    var endStr = "";

    if (min != min) {
      this.minBound = null;
    } else {
      this.minBound = this.getApproxVideoTime(min); 
      startStr = this.minBound / 1000;
    }
    if (max != max) {
      this.maxBound = null;
    } else {
      this.maxBound = this.getApproxVideoTime(max); 
      endStr = this.maxBound / 1000;
    }
    
    console.log("Bound: " + this.minBound + " , " + this.maxBound);
    this._lockTimeToBound();
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
  _getTimeOffset: function() {
    var self = this;

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
    return offset;
  },
  getApproxVideoTime: function(profileTime) {
    return profileTime + this._getTimeOffset();
  },
  getApproxTime: function VideoFrame_getApproxTime(videoTime) {
    videoTime = videoTime | (this._video.currentTime * 1000);
    return videoTime - this._getTimeOffset();
  },
};

