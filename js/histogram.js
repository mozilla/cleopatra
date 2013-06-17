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
    threads:   null,
    data:      null,
    container: null,

    eachThread: function (cb) {
      for (var id in this.threads) {
        if (this.threads.hasOwnProperty(id)) {
          cb(this.threads[id], id);
        }
      }
    },

    updateThreads: function (threads) {
      var index = 0;

      this.container.innerHTML = "";
      Object.keys(threads).forEach(function (id) {
        var thread = threads[id];
        var row = this.container.insertRow(index++);
        var container = row.insertCell(0);

        container.className = "threadHistogramDescription";
        container.innerHTML = thread.name;
        container.title = "Thread Name";

        thread.threadHistogramView = new HistogramView(thread.name, id);
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

    displayDiagnostics: function (items, threadId) {
      // Only supported on the main thread at the moment.
      this.eachThread(function (thread) { thread.diagnosticBar.hide() });
      this.threads[threadId].diagnosticBar.display(items);
    },

    dataIsOutdated: function () {
      this.eachThread(function (thread) { thread.threadHistogramView.dataIsOutdated() });
    },

    showVideoFramePosition: function (frame) {
      this.threads[0].threadHistogramView.showVideoFramePosition(frame);
    },

    highlightedCallstackChanged: function (callstack) {
      this.eachThread(function (thread) { thread.threadHistogramView.highlightedCallstackChanged(callstack) });
    },

    display: function (id, data, frameStart, widthSum, stack, boundaries) {
      this.threads[id].threadHistogramView.display(data, boundaries);
    },

    histogramSelected: function (view, cb) {
      if (gSelectedThreadId == view.threadId) {
        return void cb();
      }

      console.log("selected");

      var selectedContainer = document.getElementsByClassName("histogramSelected")[0];
      if (selectedContainer) {
        selectedContainer.classList.remove("histogramSelected");
      }
      view.container.classList.add("histogramSelected");
      gSelectedThreadId = view.threadId;
      viewOptionsChanged(cb);
      diagnosticChanged();
    }
  };

  var HistogramView = function (debugName, threadId) {
    var container = createElement("div", { className: "histogram" });

    this.canvas = createCanvas();
    container.appendChild(this.canvas);

    this.rangeSelector = new RangeSelector(this.canvas, this);
    this.rangeSelector.enableRangeSelectionOnHistogram();
    container.appendChild(this.rangeSelector.container);

    this.busyCover = createElement("div", { className: "busyCover" });
    container.appendChild(this.busyCover);

    this.debugName = debugName || "NoName";
    this.container = container;
    this.data = [];
    this.threadId = threadId;
  }

  HistogramView.prototype = {
    getCanvas: function () {
      if (!this.boundaries) {
        // Not a very good API design, I know.
        throw new Error("You need to call HistogramView.display first.");
      }

      var ctx = this.canvas.getContext("2d");
      var width = parseInt(getComputedStyle(this.canvas, null).getPropertyValue("width"));
      var height = this.canvas.height;
      var step = (this.boundaries.max - this.boundaries.min) / (width / 5);

      return { context: ctx, height: height, width: width, step: step };
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

    scheduleRender: function (callstack) {
      var fn = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
        window.webkitAnimationFrame || window.msRequestAnimationFrame;

      fn(this.render.bind(this, callstack));
    },

    render: function (callstack) {
      var info = this.getCanvas();
      var ctx = info.context;

      this.canvas.width = info.width;
      ctx.clearRect(0, 0, info.width, info.height);

      this._renderSamples(ctx, callstack, info.width, info.height - 15, info.step);
    },

    _renderSamples: function (ctx, callstack, width, height, step) {
      var curr = this.boundaries.min, x = 0;
      var data = JSON.parse(JSON.stringify(this.data));
      var slice, markers, value, color;
      var lastTimeLabel = null;
      var barWidth = 5;

      // Don't show gaps smaller then 1ms
      if (step < 1) {
        barWidth = width / (this.boundaries.max - this.boundaries.min);
        step = 1;
      }

      while (x <= width) {
        slice = [];
        markers = [];

        for (var i = 0, datum; datum = data[i]; i++) {
          if (datum.time > curr + step) {
            break;
          }

          slice.push(datum);

          if (datum.markers.length) {
            markers.push(datum.markers);
          }
        }

        if (slice.length !== 0) {
          data = data.slice(slice.length);
          value = slice.reduce(function (prev, curr) { return prev + curr.height }, 0) / slice.length;
          color = slice.reduce(function (prev, curr) { return prev + curr.color }, 0) / slice.length;
          ctx.fillStyle = "rgb(" + Math.round(color) + ",0,0)";

          if (this.isStepSelected(slice, callstack)) {
            ctx.fillStyle = "green";
          }

          var h  = (height / 100) * value;
          ctx.fillRect(x, height - h, barWidth, h);

          if (markers.length) {
            ctx.fillStyle = "rgb(255,0,0)";
            ctx.fillRect(x, 0, 1, 20);
            ctx.fillText(markers[0], x + 2, 10);
          }
        }

        if (lastTimeLabel === null && slice.length !== 0 ||
            lastTimeLabel !== null && x > lastTimeLabel + 100) {
          ctx.fillStyle = "rgb(255,0,0)";
          ctx.fillRect(x, height, 1, 5);
          ctx.fillText(Math.round(curr,0) + " ms", x + 2, height+10);
          lastTimeLabel = x;
        } else if (lastTimeLabel !== null) {
          ctx.fillStyle = "rgb(255,255,255)";
          ctx.fillRect(x, height, 1, 2);
        }


        curr += step;
        x += barWidth;
      }
    },

    pixelToTime: function (pixel) {
      return this.boundaries.min + pixel / this.container.clientWidth * (this.boundaries.max - this.boundaries.min);
    },

    timeToIndex: function (time) {
      console.log("time lookup: " + time);
      // Speed up using binary search if required, but make sure the first item
      // in case of equality.
      
      for (var i = 0; i < this.data.length - 1; i++) {
        if (this.data[i+1].time > time) {
          console.log("Found " + i + " at time: " + this.data[i].time);
          return i;
        }
      }

      console.log("Bounds: " + this.boundaries.min + " max: " + this.boundaries.max);
      console.log("Found max time: " + this.data[this.data.length-1].time);

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

      setHighlightedCallstack(frames[0], frames[0]);
      gHistogramContainer.histogramSelected(this, function () {
        gTreeManager.setSelection(list);
        setHighlightedCallstack(frames[0], frames[0]);
      });
    },

    highlightedCallstackChanged: function (stack) {
      this.scheduleRender(stack);
    },

    isStepSelected: function (data, callstack) {
      if (!callstack) {
        return false;
      }

      var leaf = callstack[callstack.length - 1];
      for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].frames.length; j++) {
          for (var k = 0; k < data[i].frames[j].length; k++) {
            if (data[i].frames[j][k] === leaf) {
              return true;
            }
          }
        }
      }

      return false;
    }
  };

  var RangeSelector = function (graph, histogram) {
    this.histogram = histogram;
    this.container = document.createElement("div", { className: "rangeSelectorContainer" });
    this.graph = graph;
    this.selectedRange = { start: 0, end: 0 };
    this.movedDuringClick = false;

    this.higlighter = createElement("div", { className: "histogramHilite collapsed" });
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
      var chain = gSampleFilters.concat({ type: "RangeSampleFilter", start: range.start, end: range.end });
      gBreadcrumbTrail.add({
        title: "Sample Range [" + range.start + ", " + (range.end + 1) + "]",
        enterCallback: function () {
          gSampleFilters = chain;
          this.higlighter.classList.add("collapsed");
          this.higlighter.style.display = "none";
          filtersChanged(range);
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
      this.mouseMarker.textContent = Math.round(this.histogram.pixelToTime(x)) + "ms";
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
