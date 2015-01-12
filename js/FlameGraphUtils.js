function FlameGraphUtils() {
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
}

FlameGraphUtils.prototype.getContainer = function(getDataCallback) {
  return this._container;
}

FlameGraphUtils.prototype.setData = function(samples) {
  const FLAME_GRAPH_BLOCK_HEIGHT = 12;
  const PALLETTE_SIZE = 10;
  const PALLETTE_HUE_OFFSET = 0;
  const PALLETTE_HUE_RANGE = 270;
  const PALLETTE_SATURATION = 60;
  const PALLETTE_BRIGHTNESS = 75;
  const PALLETTE_OPACITY = 0.7;
          
  const COLOR_PALLETTE = Array.from(Array(PALLETTE_SIZE)).map((_, i) => "hsla" +
    "(" + ((PALLETTE_HUE_OFFSET + (i / PALLETTE_SIZE * PALLETTE_HUE_RANGE))|0 % 360) +
    "," + PALLETTE_SATURATION + "%" +
    "," + PALLETTE_BRIGHTNESS + "%" +
    "," + PALLETTE_OPACITY +
    ")"
  );

  let out = [];

  // 1. Create a map of colors to arrays, representing buckets of
  // blocks inside the flame graph pyramid sharing the same style.
  let buckets = new Map();

  for (let color of COLOR_PALLETTE) {
    buckets.set(color, []);
  }

  // 2. Populate the buckets by iterating over every frame in every sample.
  let prevTime = 0;
  let prevFrames = [];

  for (let { frames, time } of samples) {
    if (!time)
      continue;

    let frameIndex = 0;

    for (var i = 0; i < frames[0].length; i++) {
      let location = gFunctions[frames[0][i]].functionName;
      let prevFrame = prevFrames[frameIndex];

      // Frames at the same location and the same depth will be reused.
      // If there is a block already created, change its width.
      if (prevFrame && prevFrame.srcData.rawLocation == location) {
        prevFrame.width = (time - prevFrame.srcData.startTime);
      }
      // Otherwise, create a new block for this frame at this depth,
      // using a simple location based salt for picking a color.
      else {
        let hash = this._getStringHash("" + location);
        let color = COLOR_PALLETTE[hash % PALLETTE_SIZE];
        let bucket = buckets.get(color);

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
    for (let i = frameIndex; i < prevFrames.length; i++) {
      prevFrames[i] = null;
    }

    prevTime = time;
  }

  // 3. Convert the buckets into a data source usable by the FlameGraph.
  // This is a simple conversion from a Map to an Array.

  for (let [color, blocks] of buckets) {
    out.push({ color, blocks });
  }

  this._graph.setData(out);
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
  const STRING_HASH_PRIME1 = 7;
  const STRING_HASH_PRIME2 = 31;

  let hash = STRING_HASH_PRIME1;

  for (let i = 0, len = input.length; i < len; i++) {
    hash *= STRING_HASH_PRIME2;
    hash = (hash + input.charCodeAt(i)) % 65535;
  }

  return hash;
};
