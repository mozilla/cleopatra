var HistogramContainer;

(function () {
  function createCanvas() {
    var canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "60px";
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
    this.container = createElement("div", {
      className: "histogramContainer",
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

    invertionChanged: function (inverted) {
      for (var i = 0; i < this.threads.length; i++) {
        this.threads[i].threadHistogramView.invertionChanged(inverted);
      }
    },

    selectRange: function (start, end) {
      this.threads[0].threadHistogramView.selectRange(start, end);
    },

    updateThreads: function (threads) {

      this.container.innerHTML = "";

      // Timeline
      this.waterfallRow = createElement("div", {
        className: "waterfallOrThreadRow",
        style: {display: "none"}
      });
      this.container.appendChild(this.waterfallRow);

      var container = createElement("div", {
        className: "threadHistogramDescription",
        innerHTML: "Frames"
      });
      this.waterfallRow.appendChild(container);

      var cell = createElement("div", {
        style: {flex: 1},
        className: "threadHistogramContent"
      });
      this.waterfall = new Waterfall();
      this.waterfallRow.appendChild(cell);

      cell.appendChild(this.waterfall.getContainer());

      var compositorThreadMinimize = null;
      Object.keys(threads).forEach(function (id) {
        var thread = threads[id];
        var row = createElement("div", {
          className: "waterfallOrThreadRow"
        });
        this.container.appendChild(row);
        var container = createElement("div", {
          className: "threadHistogramDescription",
          innerHTML: "<div class='threadHistogramDescriptionText'>" + thread.name + "</div>", //TODO: fix XSS
          title: "Thread Name"
        });
        row.appendChild(container);

        var minimizeButton = createElement("input", {
          type:"button",
          value:"Bottom"
        });
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

        if (thread.name.indexOf("Compositor") == 0) {
          compositorThreadMinimize = minimizeButton.onclick;
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

        var cell = createElement("div", {
          className: "threadHistogramContent"
        });
        row.appendChild(cell);
        cell.appendChild(thread.threadHistogramView.container);
        cell.appendChild(thread.diagnosticBar.getContainer());

        this.threads[id] = thread;
      }.bind(this));

      if (compositorThreadMinimize) {
        for (var i = 0; i < Object.keys(threads).length; i++) {
          compositorThreadMinimize();
        }
      }

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

    showVideoFramePosition: function (frame, start, end) {
      this.threads[0].threadHistogramView.showVideoFramePosition(frame, start, end);
    },

    highlightedCallstackChanged: function (callstack, inverted) {
      this.eachThread(function (thread) { thread.threadHistogramView.highlightedCallstackChanged(callstack, inverted) });
    },

    display: function (id, data, frameStart, widthSum, stack, boundaries, inverted, markers) {
      this.threads[id].threadHistogramView.display(data, boundaries, inverted, markers);
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

    addMarker: function(name, threadId, time) {
      for (var i = 0; i < this.threads.length; i++) {
        if (this.threads[i].threadId == threadId) {
          var marker = this.threads[i].threadHistogramView.addMarker(name, time);
          marker.view = this.threads[i].threadHistogramView;
          return marker;
        }
      }
      return null;
    },

    removeMarker: function(marker) {
      if (marker) {
        marker.view.removeMarker(marker);
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
    this.markers = [];
    this.inverted = false;
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
        Parser.addComment(commentStr, self.pixelToTime(x), self.threadId);
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

      var r = this.canvas.getBoundingClientRect();
      var ctx = this.canvas.getContext("2d");

      return { context: ctx, height: r.height, width: r.width };
    },

    selectRange: function(start, end) {
      this.rangeSelector.selectRange(start, end);
    },

    display: function (data, boundaries, inverted, markers) {
      this.data = data;
      this.markers = markers;
      this.boundaries = boundaries;
      this.scheduleRender();
      this.inverted = inverted;

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

    showVideoFramePosition: function (frame, start, end) {
      var caption = "Frame: " + frame;
      this.rangeSelector.highlightRange(this.timeToPixel(start), this.timeToPixel(end), caption);
      //this.selectRange(start, end);
    },

    invertionChanged: function (inverted) {
      this.inverted = inverted;
    },

    scheduleRender: function (callstack, inverted, markers) {
      var fn = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
        window.webkitAnimationFrame || window.msRequestAnimationFrame;

      fn(this.render.bind(this, callstack, inverted, markers));
    },

    addMarker: function (name, time) {
      var x = (time - this.boundaries.min) /* ms */ * this.getCanvas().width /* px */ / (this.boundaries.max - this.boundaries.min) /* ms */;

      // construct marker div with a click event
      var markerDiv = createElement("div", {
        className: "marker",
        style: {
          borderLeft: "red solid 1px",
        },
      });
      markerDiv.style.left = x + "px";
      markerDiv.style.top = "0px";

      var label = createElement("span", {
        style: { color: '#BF0039'},
      });
      label.textContent = name;
      markerDiv.appendChild(label);
      this.container.appendChild(markerDiv);

      return markerDiv;
    },

    removeMarker: function (markerDiv) {
      this.container.removeChild(markerDiv);
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

      var scale = window.devicePixelRatio || 1;
      ctx.canvas.width = info.width * scale;
      ctx.canvas.height = info.height * scale;
      ctx.scale(scale, scale);
      ctx.clearRect(0, 0, info.width, info.height);

      this._renderSamples(ctx, callstack, inverted, info.width, info.height - 15);
    },

    _renderSamples: function (ctx, callstack, inverted, width, height) {
      var curr = this.boundaries.min;
      var dataIndex = 0;
      var slice, markers, value, red, green;
      var lastTimeLabel = null;
      var lastTimeNotch = null;
      var barWidth, step;

      // bar width in px / sample
      barWidth = gMeta.interval /* ms/sample */ * width /* px */ / (this.boundaries.max - this.boundaries.min) /* ms */;
      // bar width in ms / sample
      step = gMeta.interval;

      // don't render less than 1px lines
      if (barWidth < 1) {
        step = (this.boundaries.max - this.boundaries.min) / width
        barWidth = 1;
      }

      if (barWidth <= 0)
        return;

      for (var x = 0; x <= width; x += barWidth) {
        slice = [];

        // iterate over all data starting where we left over last time and
        // ending when the time of the current datum exceeds our current time + the step size
        for (var i = dataIndex, datum; datum = this.data[i]; i++) {
          if (datum.time > curr + step) {
            break;
          }

          slice.push(datum);
          dataIndex += 1;
        }

        if (slice.length !== 0) {

          // calculate what to display for a set of data which falls under the same
          // pixel / bar
          var s = slice[0];
          value = s.height;
          movingValue = s.movingHeight;
          red = 0;
          for (var i = 0; i < slice.length; i++) {
            s = slice[i];
            // max value
            value = Math.max(value, s.height);
            // max moving value
            movingValue = Math.max(movingValue, s.movingHeight);
            // total unresponsiveness
            red += s.color;
          }
          // average unresponsiveness
          red = red / slice.length;
          green = this.percentSelected(slice, callstack, inverted) * 255;
          green = green == 0 ? 0 : Math.max(150, green);
          // red is unresponsiveness, green is selected %
          ctx.fillStyle = "rgb(" + Math.round(red / (1+green/255)) + "," + Math.round( green ) + ",0)";

          var h = (height / 100) * value;
          ctx.fillRect(x, height - h, barWidth, h);

          // Non moving
          if (gHighlighMovingStack) {
            var nonH = (height / 100) * movingValue; //lastLargestCommonFrames.length, largestCommonFrames.length);
            ctx.fillStyle = "rgba(70, 10, 200, 180)";
            ctx.fillRect(x, height - h, barWidth, nonH);
          }
        }

        if (lastTimeLabel === null ||
            lastTimeLabel !== null && x > lastTimeLabel + 100) {
          ctx.fillStyle = "rgb(0,0,0)";
          ctx.fillRect(x, height, 1, 5);
          ctx.fillText(Math.round(curr,0) + " ms", x + 2, height+10);
          lastTimeLabel = x;
        } else if (lastTimeNotch === null || lastTimeNotch + 5 < x) {
          ctx.fillStyle = "rgb(255,255,255)";
          ctx.fillRect(x, height, 1, 2);
          lastTimeNotch = x;
        }

        curr += step;
      }

      var self = this;
      var markerSets = [];
      var threadMarkers = [];

      // markers are supposed to be sorted by time
      // markers are combined if they are at the same time
      var lastMarkerTime = -1;
      if (this.markers) {
        for (var j = 0; j < this.markers.length; j++) {
          var marker = this.markers[j];
          // ignore markers that have data/category (waterfall markers)
          if (!marker.data || !marker.data.category) {
            // if the previous first marker of a set and this marker are
            //  within the same pixel, combine them
            if (lastMarkerTime != -1 && (lastMarkerTime + step / barWidth > marker.time)) {
              markerSets[markerSets.length - 1].push(marker);
            } else {
              markerSets.push([marker]);
              lastMarkerTime = marker.time;
            }
          }
        }
      }

      // render markers
      for (var z = 0; z < markerSets.length; z++) {
        var markers = markerSets[z];
        var str = "";
        var id = 1;
        var hasComment = false;
        var hasNonComment = false;
        var marker, i;
        var x = (markers[0].time - this.boundaries.min) /* ms */ * width /* px */ / (this.boundaries.max - this.boundaries.min) /* ms */;

        // construct marker div with a click event
        var markerDiv = createElement("div", { className: "marker" });
        markerDiv.style.left = x + "px";
        markerDiv.style.top = "0px";
        markerDiv.markers = markers;

        // figure out what markers are contained in the list and add them to the marker div
        var label;
        for (var i = 0; i < markers.length; i++) {
          marker = markers[i];
          hasComment |= marker.type == 'comment';
          hasNonComment |= marker.type != 'comment';
          label = createElement("span", {
            style: { color: marker.type == 'comment' ? "#3F9922" : '#BF0039'},
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
            marker: marker,
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
      }

    },

    pixelToTime: function (pixel) {
      if (!this.boundaries) {
        return null;
      }
      return this.boundaries.min + pixel / this.container.clientWidth * (this.boundaries.max - this.boundaries.min);
    },

    timeToPixel: function (time) {
      return (time - this.boundaries.min) / (this.boundaries.max - this.boundaries.min) * this.container.clientWidth;
    },

    timeToIndex: function (time) {
      // Speed up using binary search if required, but make sure the first item
      // in case of equality.

      for (var i = 0; i < this.data.length - 1; i++) {
        if (Math.floor(this.data[i+1].time) > time) {
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
      var inverted = this.inverted;
      var stack = inverted ? frames[0].clone().reverse() : frames[0];

      /**
       * @todo Decouple AppUI
       */
      AppUI.setHighlightedCallstack(stack, stack);
      gHistogramContainer.histogramSelected(this, function () {
        gTreeManager.setSelection(list, inverted);
        /**
         * @todo Decouple AppUI
         */
        AppUI.setHighlightedCallstack(stack, stack);
      });
    },

    highlightedCallstackChanged: function (stack, inverted) {
      this.scheduleRender(stack, inverted);
    },

    percentSelected: function (data, callstack, inverted) {
      if (!callstack) {
        return 0;
      }

      var dataSelected = 0;

      for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].frames.length; j++) {
          var compareStack = data[i].frames[j];
          if ( compareStack.length >= callstack.length ) {
            var match = true;
            for (var k = 0; k < Math.min(compareStack.length, callstack.length); k++) {
              if ((inverted && compareStack[compareStack.length - k - 1] !== callstack[k]) ||
                 (!inverted && compareStack[k]                           !== callstack[k])) {
                match = false;
                break;
              }
            }
            if (match) {
              dataSelected++;
            }
          }
        }
      }

      return dataSelected / data.length;
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

        var handleMouseDrag = function (ev) {
          this.movedDuringClick = true;
          this.clearMouseMarker();
          updateSelectionMarker(ev.pageX, ev.pageY);
        }.bind(this);

        var handleMouseUp = function (ev) {
          window.removeEventListener("mousemove", handleMouseDrag, false);
          window.removeEventListener("mouseup", handleMouseUp, false);
          this.graph.style.cursor = "default";
          isMouseDown = false;

          if (this.movedDuringClick) {
            updateSelectionMarker(ev.pageX, ev.pageY);
            this.finishHistogramSelection(coord.x !== ev.pageX);
          } else {
            // Handle as a click on the histogram and select the sample.
            var x = Math.min(ev.pageX, this.graph.parentNode.getBoundingClientRect().right);
            x -= this.graph.parentNode.getBoundingClientRect().left;

            var index = this.histogram.pixelToIndex(x);
            this.histogram.histogramClick(index);
          }
        }.bind(this);

        window.addEventListener("mousemove", handleMouseDrag, false);
        window.addEventListener("mouseup", handleMouseUp, false);

      }.bind(this), false);

      this.graph.addEventListener("mousemove", function (ev) {
        if (!isMouseDown) {
          this.updateMouseMarker(ev.pageX);
        }
      }.bind(this), false);
      this.graph.addEventListener("mouseout", function (ev) {
        if (!isMouseDown) {
          this.clearMouseMarker();
        }
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

    highlightRange: function (x1, x2, caption) {
      this.higlighter.classList.remove("collapsed");
      this.higlighter.classList.remove("selecting");
      this.higlighter.classList.add("finished");
      var y = 0;
      var height = this.graph.parentNode.clientHeight;
      console.log(x1 + " - " + x2);
      this.drawSelectionMarker(x1, y, x2 - x1, height, caption);
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

    drawSelectionMarker: function (x, y, width, height, caption) {
      if (width === 0) {
        return;
      }
      if (width != width) {
        width = 0;
      }
      var hl = this.higlighter;
      hl.style.left = x + "px";
      hl.style.top = "0";
      hl.style.width = width + "px";
      hl.style.height = height + "px";
      hl.style.display = "";

      var info = this.histogram.getCanvas();
      var bnd = this.histogram.boundaries;
      if (caption) {
        hl.textContent = caption;
      } else {
        hl.textContent = Math.round((bnd.max - bnd.min) / info.width * width) + "ms";
      }
    },

    clearSelectionMarker: function () {
      var hl = this.higlighter;
      hl.style.display = "none";
    },

  };
}());
