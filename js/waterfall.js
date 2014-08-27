// Test profile: e74815d8695ccf8580d4af3be5cd1371f202f6ae
// 1305aa31f417005934020cd7181d8331691945d1

function createElement(name, props) {
  var el = document.createElement(name);

  for (var key in props) {
    if (key === "style") {
      for (var styleName in props.style) {
        el.style[styleName] = props.style[styleName];
      }
    } else {
      el[key] = props[key];
    }
  }

  return el;
}

var gLayersDumps = [];

var Waterfall = function() {
  this.container = createElement("div", {
    className: "waterfallContainer histogram",
  });
  this.canvas = createElement("canvas", {
    className: "waterfallCanvas",
    style: {
      overflow: "hidden",
    },
  });
  this.busyCover = createElement("div", { className: "busyCover" });
  this.busyCover.classList.add("busy");
  this.container.appendChild(this.canvas);
  this.container.appendChild(this.busyCover);

  var timeout;
  var throttler = function () {
    if (timeout)
      return;

    timeout = setTimeout(function () {
      timeout = null;
      this.scheduleRender();
    }.bind(this), 200);
  }.bind(this);

  window.addEventListener("resize", throttler, false);
}

Waterfall.createFrameUniformityView = function(compositeTimes) {
  function findByAddress(root, address) {
    if (root.address == address) {
      return root;
    }
    for (var i = 0; i < root.children.length; i++) {
      var find = findByAddress(root.children[i], address);
      if (find) {
        return find;
      }
    }
    return null;
  }
  function compareLayers(prevLayerTree, root, graph, time) {
    if (root.address && root['screen-transform']) {
      var prevInstance = findByAddress(prevLayerTree, root.address);
      if (prevInstance && prevInstance['screen-transform']) {

        if (root['screen-transform'][0] != prevInstance['screen-transform'][0]) {
          graph[root.address] = graph[root.address] || {};
          graph[root.address]['transformX'] = graph[root.address]['transformX'] || [{ // Original value
            time: prevLayerTree.compositeTime,
            value: prevInstance['screen-transform'][0],
          }];
          graph[root.address]['transformX'].push({
            time: time,
            value: root['screen-transform'][0],
          });
        }

        if (root['screen-transform'][1] != prevInstance['screen-transform'][1]) {
          graph[root.address] = graph[root.address] || {};
          graph[root.address]['transformY'] = graph[root.address]['transformY'] || [{ // Original value
            time: prevLayerTree.compositeTime,
            value: prevInstance['screen-transform'][1],
          }];
          graph[root.address]['transformY'].push({
            time: time,
            value: root['screen-transform'][1],
          });
          dump(root['screen-transform'][1] + "\n");
        }
      }
    }
    for (var i = 0; i < root.children.length; i++) {
      compareLayers(prevLayerTree, root.children[i], graph, time);
    }
    return graph;
  }

  function computeLayerUniformity(layersDumps) {
    if (layersDumps == null || layersDumps.length < 2) {
      return null;
    }
    var prevLayersDump = parseLayers(layersDumps[0]);
    var graph = {};
    for (var i = 1; i < layersDumps.length; i++) {
      var currLayersDump = parseLayers(layersDumps[i]);

      compareLayers(prevLayersDump, currLayersDump, graph, currLayersDump.compositeTime);
      prevLayersDump = currLayersDump;
    }
    return graph;
  }
  var layerUniformityGraphs = computeLayerUniformity(gLayersDumps);
  var container = createElement("div", {
    className: "frameUniformityContainer",
    style: {
      background: "white",
      height: "100%",
    }
  });
  var graph = createElement("div", {
    id: "frameUniformityGraph",
    className: "frameGraph",
    style: {
      width: "600px",
      height: "400px",
      padding: "5px",
    }
  });
  var caption = createElement("span", {
    textContent: "Each point represents the time between composites. " +
                 "During active refresh all points should be near 16ms. " +
                 "\n" +
                 "\n" +
                 "Warning: Composite don't occur when idle and will cause " +
                 "spikes in the graph.",
     style: {
       whiteSpace: "pre",
     },
  });

  var data = ["Time between composites"];
  for (var i = 1; i < compositeTimes.length; i++) {
    data.push((compositeTimes[i] - compositeTimes[i-1]).toFixed(2));
  }

  document.body.appendChild(graph);
  var chart = c3.generate({
    bindto: '#frameUniformityGraph',
    data: {
        columns: [
          data,
        ]
    }
  });
  document.body.removeChild(graph);
  graph.id = "";

  container.appendChild(graph);
  container.appendChild(caption);

  var layerUniformityHeader = createElement("h2", {
    textContent: "Layer Animation Uniformity"
  });
  container.appendChild(layerUniformityHeader);
  var layerUniformityDesc = createElement("span", {
    textContent: "The following graph track the movement of layers. " +
                 "Curves should be smooth during most animation like deceleration.",
  });
  container.appendChild(layerUniformityDesc);

  layerUniformityGraphs = layerUniformityGraphs || {};
  for (var address in layerUniformityGraphs) {
    var layerUniformityGraph = layerUniformityGraphs[address];
    if (layerUniformityGraph.transformY && layerUniformityGraph.transformY.length > 2) {
      var time = ['Time'];
      var data = ["Layer " + address + " transformY"];
      for (var i = 0; i < layerUniformityGraph.transformY.length; i++) {
        var obj = layerUniformityGraph.transformY[i];
        time.push(obj.time.toFixed(2));
        data.push(obj.value);
      }
      var graph = createElement("div", {
        id: "frameUniformityGraph",
        className: "frameGraph",
        style: {
          width: "600px",
          height: "400px",
          padding: "5px",
        }
      });
      document.body.appendChild(graph);
      var chart = c3.generate({
        bindto: '#frameUniformityGraph',
        data: {
            x: 'Time',
            columns: [
              time,
              data,
            ]
        }
      });
      document.body.removeChild(graph);
      graph.id = "";
      container.appendChild(graph);
    }
  }

  return container;
};

// Frame Positions is in {layerLabel : [[x0, y0], [x1, y1]] } format
Waterfall.createFramePositionView = function(framePositions) {
  // Returns [ [layer1X, x0, x1..], [layer1Y, y0, y1..] ]
  function formatForChart() {
    var result = [];
    for (layer in framePositions) {
      var layerData = framePositions[layer];
      var layerX = [layer + ".x"];
      var layerY = [layer + ".y"];

      for (var i = 0; i < layerData.length; i++) {
        layerX.push(layerData[i][0]);
        layerY.push(layerData[i][1]);
      }

      result.push(layerX);
      result.push(layerY);
    }

    return result;
  }

  function createGraph() {
    var graph = createElement("div", {
      id: "positionUniformityGraph",
      className: "frameGraph",
      style: {
        width: "1400px",
        height: "800px",
        padding: "5px",
      }
    });

    var layerData = formatForChart();
    document.body.appendChild(graph);
    var chart = c3.generate({
      bindto: '#positionUniformityGraph',
      data: {
          columns: layerData
      }
    });
    document.body.removeChild(graph);
    // Have to reset graph.id to something else so when we repaint
    // we can override this graph
    graph.id = "";
    container.appendChild(graph);
  }

  function createFrameUniformityUsage(container) {
    var text = "No frame position uniformity data. You can enable this view by " +
               " setting the preference layers.uniformity-info to true and by " +
               "profiling the compositor thread. To profile the compositor thread, " +
               "Use the command './profile.sh start -p b2g -t Compositor'. To get touch data, " +
               "also profile the 'GeckoMain' thread. e.g. ./profile.sh -t Compositor,GeckoMain'";
    container.innerHTML = text;
  }

  var container = createElement("div", {
    className: "frameUniformityContainer",
    id: "framePositionContainer",
    style: {
      background: "white",
      height: "100%",
    }
  });

  var markerCount = Object.keys(framePositions).length;
  if (markerCount != 0) {
    createGraph()
  } else {
    createFrameUniformityUsage(container);
  }

  return container;
};

Waterfall.prototype = {
  getContainer: function Waterfall_getContainer() {
    return this.container;
  },

  scheduleRender: function () {
  },

  dataIsOutdated: function() {
    this.busyCover.classList.add("busy");
  },

  formatStack: function(stack) {
    var str = "";
    for (var i = stack.length - 1; i >= 0; i--) {
      var frame = stack[i];
      str += frame + "\n";
    }
    return str;
  },

  formatDisplayListDump: function(displayListDump) {
    var str = "";
    for (var i = 0; i < displayListDump.length; i++) {
      var line = displayListDump[i];
      str += line.name + "\n";
    }

    if (!this.hasSeenDisplayListDump) {
      this.hasSeenDisplayListDump = true;
      tab_showInstruction("DisplayList", "To view a Display List dump you must click on a 'DisplayList' bubble in the Frames timeline.");
    }
    return str;
  },

  formatLayersDump: function(layersDump) {
    var str = "";
    for (var i = 0; i < layersDump.length; i++) {
      var line = layersDump[i];
      str += line.name + "\n";
    }

    if (!this.hasSeenLayersDump) {
      this.hasSeenLayersDump = true;
      tab_showInstruction("LayerTree", "To view a layers dump you must click on a 'Composite' bubble in the Frames timeline.");
    }
    return str;
  },

  display: function Waterfall_display(data) {
    // we assume the data of each type is in order and non-overlapping
    this.busyCover.classList.remove("busy");
    var i, item;
    this.container.innerHTML = "";
    var self = this;
    // On a 1080p monitor this is about 1px. We want to merge things that are invisible so we don't want to create separate element for every item if they are too small and too close.
    var maxCloseness = 0.1;
    var maxWidth = 0.1;

    var typeOrder = ['RD', 'Scripts', 'Styles', 'Reflow', 'DisplayList', 'Rasterize', 'Composite', 'Other'];
    var cssClasses = ['waterfallFrame', 'waterfallItem', 'waterfallItem', 'waterfallItem', 'waterfallItem', 'waterfallItem', 'waterfallItem', 'waterfallItem'];
    var colorList = ['rgba(0,200,0,0.5)', 'rgb(250,100,40)', 'rgb(40,40,100)', 'rgb(40,40,100)', 'rgb(150,40,100)', 'rgb(100,250,40)', 'rgb(100,40,250)', 'rgb(200,0,0)'];
    var barHeight = [0.5, 0, 1, 1, 1, 2, 3, 0];

    gLayersDumps = [];

    var filtered = {};
    for (i = 0; i < typeOrder.length; i++) {
      filtered[typeOrder[i]] = [];
    }

    // separate the data.items input into categories by type of marker and filter out any outside the view
    for (i = 0; i < data.items.length; i++) {
      item = data.items[i];
      if (item.startTime > data.boundaries.min && item.startTime < data.boundaries.max ||
          item.endTime > data.boundaries.min && item.endTime < data.boundaries.max) {
        // if the item is in the list, put it in the corresponding category, otherwise in the "Other"
        if (~typeOrder.indexOf(item.type)) {
          filtered[item.type].push(item);
        } else {
          filtered['Other'].push(item);
        }
      }
    }

    function makeWaterfallBar(cssClass, text, title, startX, startY, width, color) {
      return createElement("div", {
        className: cssClass,
        innerHTML: "<center>" + text + "</center>", //TODO XSS filter
        title: title,
        style: {
          left: startX + "%",
          top: startY + "px",
          width: width + "%",
          background: color,
        },
      });
    }

    // this state machine combines contiguous blocks of elements with width less than maxWidth % and
    // distance between them of less than maxCloseness
    function appendFilteredMarkers(container, markers, cssClass, startY, maxCloseness, maxWidth, color) {
      var i, item;
      var duration = data.boundaries.max - data.boundaries.min;
      var mergeLength = 0, mergeStartTime, mergeEndTime, mergeSumOfdurations;
      var prevText, prevItemTitle, prevStartX, prevWidth;
      var startX, width, itemTitle, text;

      // if there is one element in the merge, display that element, otherwise combine all elements inside
      function endMerge() {
          // if there's only one item merged, display it as if it wasn't merged
          if (mergeLength == 1) {
            container.appendChild(makeWaterfallBar(cssClass, prevText, prevItemTitle, prevStartX, startY, prevWidth, color));
          } else {
            // draw the merged bar
            container.appendChild(makeWaterfallBar(cssClass, "&nbsp;", text + " x" + mergeLength + " over " + mergeSumOfdurations.toFixed(2) + " ms", mergeStartTime, startY, mergeEndTime - mergeStartTime, "#000"));
          }
          // mark the merge as processed and reset its duration
          mergeLength = 0;
          mergeSumOfdurations = 0;
      }

      // go through each marker and either create a bar for it or combine it with subsequent markers into a merged bar
      for (i = 0; i < markers.length; i++) {
        item = markers[i];
        // calculate the positions on the canvas
        startX = (item.startTime - data.boundaries.min) * 100 / duration;
        width = (item.endTime - data.boundaries.min) * 100 / duration - startX;

        // set the marker's text and title
        itemTitle = item.text + " " + (item.endTime - item.startTime).toFixed(2) + " ms";
        text = item.text;
        if (item.causeStack) {
          itemTitle += "\n" + self.formatStack(item.causeStack);
        }
        if (item.layersDump) {
          item.layersDump.compositeTime = item.endTime;
          gLayersDumps.push(item.layersDump);
          itemTitle += "\n" + self.formatLayersDump(item.layersDump);
        }
        if (item.displayListDump) {
          itemTitle += "\n" + self.formatDisplayListDump(item.displayListDump);
        }

        // if there was a merge happening and we are too far or too wide to join, end it
        if (mergeLength > 0 && (mergeEndTime + maxCloseness < startX || width > maxWidth)) {
          endMerge();
        }

        // if this element is big enough to be visible on its own we just draw it
        if (width > maxWidth) {
          // render the current element because it can stand on its own
          var loneElement = makeWaterfallBar(cssClass, text, itemTitle, startX, startY, width, color);
          if (item.layersDump) {
            (function (layersDump, text, startTime) {
              loneElement.onclick = function() {
                tab_showLayersDump(layersDump, text, startTime);
              }
            })(item.layersDump, text, item.startTime);
          }
          if (item.displayListDump) {
            (function (displayListDump, text, startTime) {
              loneElement.onclick = function() {
                tab_showDisplayListDump(displayListDump, text, startTime);
              }
            })(item.displayListDump, text, item.startTime);
          }
          container.appendChild(loneElement);
        } else {
          // since our bar is too small we create or join a merge
          if (mergeLength == 0) {
            mergeStartTime = startX;
          }
          mergeLength++;
          mergeSumOfdurations += item.endTime - item.startTime;
          mergeEndTime = startX + width;
        }
        // we keep track of the previous item because in the case of one item being a part of a merge, we might want to cancel the merge and display the item instead
        prevText = text; prevItemTitle = itemTitle; prevStartX = startX; prevWidth = width;
      }
      // if there's an unclosed merge at the end close it
      if (mergeLength > 0) {
        endMerge();
      }
    }

    var startY = 0;
    // go over every type of item and display each type on its own row with its own color
    for (i = 0; i < typeOrder.length; i++) {
      var type = typeOrder[i];
      if (filtered[type]) {
        //TODO: possible optimization: createFragment
        appendFilteredMarkers(this.container, filtered[type], cssClasses[i], barHeight[i]*15, maxCloseness, maxWidth, colorList[i]);
      }
    }

  },
};
