function FlameGraphUtils() {
}

FlameGraphUtils.prototype.getContainer = function() {
  this._container = createElement("div", {
    className: "tab",
    style: {
      background: "white",
      height: "100%",
    },
  });

  this._graph = new FlameGraph(this._container);
  this._graph.ready().then(function() {
    if (this._data) {
      this._graph.setData(this._data);
    }
  }.bind(this), function() {});

  return this._container;
}

FlameGraphUtils.prototype.setData = function(samples) {
  var FLAME_GRAPH_BLOCK_HEIGHT = 12;
  var FLAME_GRAPH_MAX_GAP = 5; // After this gap we consider the sample missed
  var PALLETTE_SIZE = 10;
  var PALLETTE_HUE_OFFSET = 0;
  var PALLETTE_HUE_RANGE = 270;
  var PALLETTE_SATURATION = 60;
  var PALLETTE_BRIGHTNESS = 75;
  var PALLETTE_OPACITY = 0.7;
          
  var COLOR_PALLETTE = [];
  for (var i = 0; i < PALLETTE_SIZE; i++) {
    COLOR_PALLETTE.push(
      "hsla" +
      "(" + ((PALLETTE_HUE_OFFSET + (i / PALLETTE_SIZE * PALLETTE_HUE_RANGE))|0 % 360) +
      "," + PALLETTE_SATURATION + "%" +
      "," + PALLETTE_BRIGHTNESS + "%" +
      "," + PALLETTE_OPACITY +
      ")"
    );
  }

  var out = [];

  // 1. Create a map of colors to arrays, representing buckets of
  // blocks inside the flame graph pyramid sharing the same style.
  var buckets = {};

  for (var i = 0; i < COLOR_PALLETTE.length; i++) {
    var color = COLOR_PALLETTE[i];
    buckets[color] = [];
  }

  // 2. Populate the buckets by iterating over every frame in every sample.
  var prevTime = null;
  var prevFrames = [];

  for (var j = 0; j < samples.length; j++) {
    var sample = samples[j];
    var frames = sample.frames;
    var time = sample.time;
    if (!time)
      continue;

    if (prevTime == null || time - prevTime > FLAME_GRAPH_MAX_GAP) {
      prevTime = time;
    }

    var frameIndex = 0;

    for (var i = 0; i < frames[0].length; i++) {
      var location = gFunctions[frames[0][i]].functionName;
      var prevFrame = prevFrames[frameIndex];

      // Frames at the same location and the same depth will be reused.
      // If there is a block already created, change its width.
      if (prevFrame && prevFrame.srcData.rawLocation == location &&
          prevFrame.width + FLAME_GRAPH_MAX_GAP > (time - prevFrame.srcData.startTime)) {
        prevFrame.width = (time - prevFrame.srcData.startTime);
      }
      // Otherwise, create a new block for this frame at this depth,
      // using a simple location based salt for picking a color.
      else {
        var hash = this._getStringHash(location);
        var color = COLOR_PALLETTE[hash % PALLETTE_SIZE];
        var bucket = buckets[color];

        bucket.push(prevFrames[frameIndex] = {
          srcData: { startTime: prevTime, rawLocation: location },
          x: prevTime,
          y: frameIndex * FLAME_GRAPH_BLOCK_HEIGHT,
          width: time - prevTime,
          height: FLAME_GRAPH_BLOCK_HEIGHT,
          text: location
        });
      }

      frameIndex++;
    }

    // Previous frames at stack depths greater than the current sample's
    // maximum need to be nullified. It's nonsensical to reuse them.
    for (var i = frameIndex; i < prevFrames.length; i++) {
      prevFrames[i] = null;
    }

    prevTime = time;
  }

  // 3. Convert the buckets into a data source usable by the FlameGraph.
  // This is a simple conversion from a Map to an Array.

  for (var i = 0; i < buckets.length; i++) {
    var bucket = buckets[i];
    var color = bucket.color;
    var blocks = bucket.blocks;
    out.push({ color: color, blocks: blocks });
  }

  if (this._graph) {
    this._graph.setData(out);
  }
  this._data = out;

  return out;
}

/**
 * Very dumb hashing of a string. Used to pick colors from a pallette.
 *
 * @param string input
 * @return number
 */
FlameGraphUtils.prototype._getStringHash = function(input) {
  var STRING_HASH_PRIME1 = 7;
  var STRING_HASH_PRIME2 = 31;

  var hash = STRING_HASH_PRIME1;

  for (var i = 0, len = input.length; i < len; i++) {
    hash *= STRING_HASH_PRIME2;
    hash = (hash + input.charCodeAt(i)) % 65535;
  }

  return hash;
};
