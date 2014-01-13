var HistogramContainer;

(function () {
  function createCanvas() {
    var canvas = document.createElement("canvas");
    canvas.height = 60;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    return canvas;
  }

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

  HistogramContainer = function () {
    this.threads = [];
    this.container = createElement("table", {
      className: "histogramContainer",
      style: { width: "100%", height: "100%" },
      border: "0",
      borderCollapse: "collapse",
      cellPadding: "0",
      cellSpacing: "0"
    });
  }

  HistogramContainer.prototype = {
    threads:            null,
    data:               null,
    container:          null,
    waterfallRow:       null,
    waterfall:          null,

    eachThread: function (cb) {
      for (var id in this.threads) {
        if (this.threads.hasOwnProperty(id)) {
          cb(this.threads[id], id);
        }
      }
    },

    selectRange: function (start, end) {
      this.threads[0].threadHistogramView.selectRange(start, end);
    },

    updateThreads: function (threads) {
      var index = 0;

      this.container.innerHTML = "";

      // Timeline
      this.waterfallRow = this.container.insertRow(index++);
      this.waterfallRow.style.display = "none";
      var container = this.waterfallRow.insertCell(0);
      container.className = "threadHistogramDescription";
      container.innerHTML = "Frames";
      var cell = this.waterfallRow.insertCell(1);
      this.waterfall = new Waterfall();
      cell.appendChild(this.waterfall.getContainer());

      Object.keys(threads).forEach(function (id) {
        var thread = threads[id];
        var row = this.container.insertRow(index++);
        var container = row.insertCell(0);

        container.className = "threadHistogramDescription";
        container.innerHTML = thread.name + "<br>";
        container.title = "Thread Name";

        var minimizeButton = createElement("input", {type:"button", value:"Bottom"});
        container.appendChild(minimizeButton);
        var self = this;
        minimizeButton.onclick = function() {
          var tableRow = container.parentNode;
          var startY = tableRow.getBoundingClientRect().top;
          var table = tableRow.parentNode;
          tableRow.parentNode.removeChild(tableRow);
          table.appendChild(tableRow);
          var endY = tableRow.getBoundingClientRect().top;
        }

        thread.threadHistogramView = new HistogramView(this, thread.name, id);
        thread.threadId = id;

        thread.diagnosticBar = new DiagnosticBar();
        thread.diagnosticBar.hide();
        thread.diagnosticBar.setDetailsListener(function (details) {
          var bugId;

          if (details.indexOf("bug ") == 0) {
            bugId = details.substring(4);
            window.open("https://bugzilla.mozilla.org/show_bug.cgi?id=" + bugId);
            return;
          }

          var view = new SourceView();
          view.setText("Diagnostic", js_beautify(details));
          gMainArea.appendChild(view.getContainer());
        })

        var cell = row.insertCell(1);
        cell.appendChild(thread.threadHistogramView.container);
        cell.appendChild(thread.diagnosticBar.getContainer());

        this.threads[id] = thread;
      }.bind(this));

      this.threads[0].threadHistogramView.container.classList.add("histogramSelected");
    },

    onMarkerClick: function(cb) {
      this._onMarkerClick = cb;
    },

    displayDiagnostics: function (items, threadId) {
      // Only supported on the main thread at the moment.
      this.eachThread(function (thread) { thread.diagnosticBar.hide() });
      this.threads[threadId].diagnosticBar.display(items, this.threads[threadId].threadHistogramView.boundaries);
    },

    dataIsOutdated: function () {
      this.eachThread(function (thread) { thread.threadHistogramView.dataIsOutdated() });
    },

    showVideoFramePosition: function (frame) {
      this.threads[0].threadHistogramView.showVideoFramePosition(frame);
    },

    highlightedCallstackChanged: function (callstack, inverted) {
      this.eachThread(function (thread) { thread.threadHistogramView.highlightedCallstackChanged(callstack, inverted) });
    },

    display: function (id, data, frameStart, widthSum, stack, boundaries) {
      this.threads[id].threadHistogramView.display(data, boundaries);
    },

    displayWaterfall: function(data) {
      if (this.waterfall && data) {
        this.waterfallRow.style.display = "";
        this.waterfall.display(data);
      }
      if (!data && this.waterfallRow) {
        this.waterfallRow.style.display = "none";
      }
    },

    histogramSelected: function (view, cb) {
      if (gSelectedThreadId == view.threadId) {
        return void cb();
      }

      var selectedContainer = document.getElementsByClassName("histogramSelected")[0];
      if (selectedContainer) {
        selectedContainer.classList.remove("histogramSelected");
      }
      view.container.classList.add("histogramSelected");
      gSelectedThreadId = view.threadId;
      AppUI.viewOptionsChanged(cb);
      AppUI.diagnosticChanged();
    }
  };

  var HistogramView = function (manager, debugName, threadId) {
    var container = createElement("div", { className: "histogram" });

    this.canvas = createCanvas();
    this.barWidth = 1;
    container.appendChild(this.canvas);

    this.rangeSelector = new RangeSelector(this.canvas, this);
    this.rangeSelector.enableRangeSelectionOnHistogram();
    container.appendChild(this.rangeSelector.container);

    this.busyCover = createElement("div", { className: "busyCover" });
    container.appendChild(this.busyCover);

    this.manager = manager;
    this.debugName = debugName || "NoName";
    this.container = container;
    this.data = [];
    this.threadId = threadId;
    this.boundaries = null;

    this._contextMenu = document.createElement("menu");
    this._contextMenu.setAttribute("type", "context");
    this._contextMenu.id = "contextMenuForHisto" + HistogramView.instanceCounter++;
    var self = this;
    this.container.addEventListener("contextmenu", function(event) {
      var x = event.layerX;
      self._contextMenu.innerHTML = "";
      var menuItem = "Add Comment";
      var menuItemNode = document.createElement("menuitem");
      menuItemNode.onclick = function () {
        var commentStr = prompt("Comment:");
        // update the stored data
        Parser.addComment(commentStr, self.pixelToIndex(x), self.threadId);
        window.AppUI.filtersChanged();
      };
      menuItemNode.label = menuItem;
      self._contextMenu.appendChild(menuItemNode);
      // Very important
      self.container.setAttribute("contextmenu", self._contextMenu.id);
    }, true);
    container.appendChild(this._contextMenu);

  }
  HistogramView.instanceCounter = 0;

  HistogramView.prototype = {
    getCanvas: function () {
      if (!this.boundaries) {
        // Not a very good API design, I know.
        throw new Error("You need to call HistogramView.display first.");
      }

      var ctx = this.canvas.getContext("2d");
      var width = parseInt(getComputedStyle(this.canvas, null).getPropertyValue("width"));
      var height = this.canvas.height;
      var step = (this.boundaries.max - this.boundaries.min) / (width / this.barWidth);

      return { context: ctx, height: height, width: width, step: step };
    },

    selectRange: function(start, end) {
      this.rangeSelector.selectRange(start, end);
    },

    display: function (data, boundaries) {
      this.data = data;
      this.boundaries = boundaries;
      this.scheduleRender();

      var timeout;
      var throttler = function () {
        if (timeout)
          return;

        timeout = setTimeout(function () {
          timeout = null;
          this.dataIsOutdated();
          this.scheduleRender();
          this.busyCover.classList.remove("busy");
        }.bind(this), 200);
      }.bind(this);

      window.addEventListener("resize", throttler, false);

      this.busyCover.classList.remove("busy");
    },

    scheduleRender: function (callstack, inverted) {
      var fn = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
        window.webkitAnimationFrame || window.msRequestAnimationFrame;

      fn(this.render.bind(this, callstack, inverted));
    },

    render: function (callstack, inverted) {
      var info = this.getCanvas();
      var ctx = info.context;

      // Clear labels
      var markersDiv = this.container.getElementsByClassName("marker");
      while(markersDiv.length > 0){
        var markerDiv = markersDiv[0];
        markerDiv.parentNode.removeChild(markerDiv);
      }

      this.canvas.width = info.width;
      ctx.clearRect(0, 0, info.width, info.height);

      this._renderSamples(ctx, callstack, inverted, info.width, info.height - 15, info.step);
    },

    _renderSamples: function (ctx, callstack, inverted, width, height, step) {
      var curr = this.boundaries.min, x = 0;
      var data = JSON.parse(JSON.stringify(this.data));
      var slice, markers, value, color;
      var lastTimeLabel = null;
      var lastTimeNotch = null;
      var barWidth = this.barWidth;

      // Don't show gaps smaller then 1ms
      if (step < 1) {
        barWidth = width / (this.boundaries.max - this.boundaries.min);
        step = 1;
      }

      if (barWidth <= 0)
        return;

      var threadMarkers = [];

      while (x <= width) {
        slice = [];
        markers = [];

        for (var i = 0, datum; datum = data[i]; i++) {
          if (datum.time > curr + step) {
            break;
          }

          slice.push(datum);
          if (datum.markers.length) {
            for (var j = 0; j < datum.markers.length; j++) {
              var marker = datum.markers[j]
              if (!marker.data || !marker.data.category || marker.data.stack) {
                markers.push({
                  name: marker.name,
                  time: datum.time,
                  marker: marker,
                });
              }
              //threadMarkers.push(datum.markers[j]);
            }
          }
        }

        if (slice.length !== 0) {
          data = data.slice(slice.length);
          value = slice.reduce(function (prev, curr) { return Math.max(prev, curr.height) }, 0);
          movingValue = slice.reduce(function (prev, curr) { return Math.max(prev, curr.movingHeight) }, 0);
          color = slice.reduce(function (prev, curr) { return prev + curr.color }, 0) / slice.length;
          ctx.fillStyle = "rgb(" + Math.round(color) + ",0,0)";

          if (this.isStepSelected(slice, callstack, inverted)) {
            ctx.fillStyle = "green";
          }

          var h = (height / 100) * value;
          ctx.fillRect(x, height - h, barWidth, h);

          // Non moving
          if (gHighlighMovingStack) {
            var nonH = (height / 100) * movingValue; //lastLargestCommonFrames.length, largestCommonFrames.length);
            ctx.fillStyle = "rgba(70, 10, 200, 180)";
            ctx.fillRect(x, height - h, barWidth, nonH);
          }

          var self = this;
          if (markers.length) {
            var str = "";
            var id = 1;
            var hasComment = false;
            var hasNonComment = false;
            var marker, i;

            // construct marker div with a click event
            var markerDiv = createElement("div", { className: "marker" });
            markerDiv.style.left = x + "px";
            markerDiv.style.top = "0px";
            markerDiv.markers = markers;

            // figure out what markers are contained in the list and add them to the marker div
            var label;
            for (var i = 0; i < markers.length; i++) {
              marker = markers[i];
              hasComment |= marker.marker.type == 'comment';
              hasNonComment |= marker.marker.type != 'comment';
              label = createElement("span", {
                style: { color: marker.marker.type == 'comment' ? "#3F9922" : '#BF0039'},
              });
              if (markers.length > 1) {
                label.textContent = (id++) + ": " +  marker.name + " ";
              } else {
                label.textContent = marker.name;
              }
              markerDiv.appendChild(label);
            }

            // add a click event to the marker div that runs the marker click callback if defined
            (function(markers) {
              markerDiv.addEventListener("click", function() {
                if (self.manager._onMarkerClick) {
                  self.manager._onMarkerClick(threadMarkers, markers[0]);
                }
              });
            })(markers);
            // each marker gets a list of the thread markers
            markers.forEach(function (marker) {
              threadMarkers.push({
                div: markerDiv,
                marker: marker.marker,
                name: marker.name,
                time: marker.time,
              });
            });

            // add marker div on top of the canvas
            self.container.appendChild(markerDiv);

            // draw notch for marker
            var yPos = 0;
            var yEnd = 20;
            if (hasNonComment) {
              ctx.fillStyle = "rgb(255,0,0)";
              ctx.fillRect(x, yPos, 1, yEnd - yPos);
              yPos += 10;
            }
            if (hasComment) {
              ctx.fillStyle = "rgb(0,255,0)";
              ctx.fillRect(x, yPos, 1, yEnd - yPos);
            }
            //ctx.fillText(markers[0], x + 2, 10);
          }
        }

        if (lastTimeLabel === null ||
            lastTimeLabel !== null && x > lastTimeLabel + 100) {
          ctx.fillStyle = "rgb(255,0,0)";
          ctx.fillRect(x, height, 1, 5);
          ctx.fillText(Math.round(curr,0) + " ms", x + 2, height+10);
          lastTimeLabel = x;
        } else if (lastTimeNotch === null || lastTimeNotch + 5 < x) {
          ctx.fillStyle = "rgb(255,255,255)";
          ctx.fillRect(x, height, 1, 2);
          lastTimeNotch = x;
        }

        curr += step;
        x += barWidth;
      }
    },

    pixelToTime: function (pixel) {
      return this.boundaries.min + pixel / this.container.clientWidth * (this.boundaries.max - this.boundaries.min);
    },

    timeToIndex: function (time) {
      // Speed up using binary search if required, but make sure the first item
      // in case of equality.
      
      for (var i = 0; i < this.data.length - 1; i++) {
        if (this.data[i+1].time > time) {
          return i;
        }
      }

      return this.data.length - 1;
    },

    pixelToIndex: function (pixel) {
      return this.timeToIndex(this.pixelToTime(pixel));
    },

    dataIsOutdated: function () {
      this.busyCover.classList.add("busy");
    },

    histogramClick: function (index) {
      var sample = this.data[index];
      var frames = sample.frames;
      var list = gSampleBar.setSample(frames[0]);

      /**
       * @todo Decouple AppUI
       */
      AppUI.setHighlightedCallstack(frames[0], frames[0]);
      gHistogramContainer.histogramSelected(this, function () {
        gTreeManager.setSelection(list);
        /**
         * @todo Decouple AppUI
         */
        AppUI.setHighlightedCallstack(frames[0], frames[0]);
      });
    },

    highlightedCallstackChanged: function (stack, inverted) {
      this.scheduleRender(stack, inverted);
    },

    isStepSelected: function (data, callstack, inverted) {
      if (!callstack) {
        return false;
      }

      for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].frames.length; j++) {
          var compareStack = data[i].frames[j];
          if (inverted) {
            //dump("compare: " + JSON.stringify(compareStack) + "\n");
            compareStack = compareStack.reverse();
            //dump("compare inverted: " + JSON.stringify(compareStack) + "\n");
          }
          for (var k = 0; k < compareStack.length; k++) {
            if (k < callstack.length && compareStack[k] !== callstack[k]) {
              //dump("no match at index: " + k + " compare: " + JSON.stringify(compareStack) + " vs " + JSON.stringify(callstack) + "\n");
              return false;
            }
          }
        }
      }

      return true;
    }
  };

  var RangeSelector = function (graph, histogram) {
    this.histogram = histogram;
    this.container = createElement("div", { className: "rangeSelectorContainer" });
    this.graph = graph;
    this.selectedRange = { start: 0, end: 0 };
    this.movedDuringClick = false;

    this.higlighter = createElement("div", { className: "histogramMouseMarker histogramHilite collapsed" });
    this.container.appendChild(this.higlighter);

    this.mouseMarker = createElement("div", {
      className: "histogramMouseMarker",
      style: { display: "none" },
      textContent: "..."
    });
    this.container.appendChild(this.mouseMarker);
  };

  RangeSelector.prototype = {
    selectedRange: null,

    enableRangeSelectionOnHistogram: function () {
      var isMouseDown = false;
      var rect = null;
      var coord = {};

      var updateSelectionMarker = function (x, y) {
        x = Math.min(x, rect.right);

        var start = {
          x: Math.min(x, coord.x) - rect.left,
          y: 0
        };

        var width = Math.abs(x - coord.x);
        var height = this.graph.parentNode.clientHeight;

        if (start.x < 0) {
          width += start.x;
          start.x = 0;
        }

        this.selectedRange.start = start.x;
        this.selectedRange.end = start.x + width;
        this.drawSelectionMarker(start.x, start.y, width, height);
      }.bind(this);

      this.graph.addEventListener("mousedown", function (ev) {
        if (ev.button !== 0) {
          return;
        }

        this.graph.style.cursor = "col-resize";
        isMouseDown = true;

        // Begin histogram selection
        this.higlighter.classList.remove("finished");
        this.higlighter.classList.remove("collapsed");
        this.higlighter.classList.add("selecting");

        coord.x = ev.pageX;
        coord.y = ev.pageY;
        rect = this.graph.parentNode.getBoundingClientRect();

        // Remove selection markers from all threads.
        gHistogramContainer.eachThread(function (thread) {
          thread.threadHistogramView.rangeSelector.clearSelectionMarker();
        });

        updateSelectionMarker(coord.x, coord.y);
        this.movedDuringClick = false;
        ev.preventDefault();
      }.bind(this), false);

      this.graph.addEventListener("mouseup", function (ev) {
        this.graph.style.cursor = "default";

        var x, index;
        if (!this.movedDuringClick) {
          // Handle as a click on the histogram and select the sample.
          x = Math.min(ev.pageX, this.graph.parentNode.getBoundingClientRect().right);
          x = x - this.graph.parentNode.getBoundingClientRect().left;

          index = this.histogram.pixelToIndex(x);

          isMouseDown = false;
          return void this.histogram.histogramClick(index);
        }

        if (isMouseDown) {
          updateSelectionMarker(ev.pageX, ev.pageY);
          this.finishHistogramSelection(coord.x !== ev.pageX);
          isMouseDown = false;
        }
      }.bind(this), false);

      this.graph.addEventListener("mousemove", function (ev) {
        this.movedDuringClick = true;
        if (isMouseDown) {
          this.clearMouseMarker();
          updateSelectionMarker(ev.pageX, ev.pageY);
          return;
        }

        this.updateMouseMarker(ev.pageX);
      }.bind(this), false);

      this.graph.addEventListener("mouseout", function (ev) {
        this.clearMouseMarker();
      }.bind(this), false);
    },

    finishHistogramSelection: function (isSelected) {
      this.higlighter.classList.remove("selecting");

      if (!isSelected) {
        return void this.higlighter.classList.add("collapsed");
      }

      this.higlighter.classList.add("finished");

      var range = this.getSampleRange(this.selectedRange);
      this.selectRange(range.start, range.end);
    },

    selectRange: function (start, end) {
      var chain = gSampleFilters.concat({ type: "RangeSampleFilter", start: start, end: end });
      gBreadcrumbTrail.add({
        title: "Sample Range [" + start + ", " + (end + 1) + "]",
        enterCallback: function () {
          gSampleFilters = chain;
          this.higlighter.classList.add("collapsed");
          this.higlighter.style.display = "none";
          window.dispatchEvent(new CustomEvent('filters-changed', {
            detail: {
              start: start,
              end: end
            }
          }));
        }.bind(this)
      })

    },

    getSampleRange: function (coords) {
      var info = this.histogram.getCanvas();
      var bnd = this.histogram.boundaries;
      var timePerPixel = (bnd.max - bnd.min) / info.width;
      var start = bnd.min + Math.round(coords.start * timePerPixel);
      var end = bnd.min + Math.round(coords.end * timePerPixel);

      return { start: start, end: end };
    },

    updateMouseMarker: function (x) {
      this.mouseMarker.style.display = "";
      x = x - this.graph.parentNode.getBoundingClientRect().left;
      this.mouseMarker.style.left = x + "px";

      this.mouseMarkerTime = this.histogram.pixelToTime(x);

      var str;
      try {
        if (gShowPowerInfo) {
          var index = this.histogram.pixelToIndex(x);
          str = this.histogram.data[index].power.toFixed(1) + " Watts"
        } else { // show time
          str = Math.floor(this.mouseMarkerTime) + "ms";
        }
      } catch (e) {
        str = "Err" + e.message;
      }

      this.mouseMarker.textContent = str;
    },

    clearMouseMarker: function () {
      this.mouseMarker.style.display = "none";
    },

    drawSelectionMarker: function (x, y, width, height) {
      if (width === 0) {
        return;
      }
      var hl = this.higlighter;
      hl.style.left = x + "px";
      hl.style.top = "0";
      hl.style.width = width + "px";
      hl.style.height = height + "px";
      hl.style.display = "";

      var info = this.histogram.getCanvas();
      var bnd = this.histogram.boundaries;
      hl.textContent = Math.round((bnd.max - bnd.min) / info.width * width) + "ms";
    },

    clearSelectionMarker: function () {
      var hl = this.higlighter;
      hl.style.display = "none";
    },

  };
}());
