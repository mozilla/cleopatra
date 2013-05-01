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

        thread.threadHistogramView = new HistogramView(thread.name);
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

    selectRange: function (start, end) {
      // TODO: Multiple threads support
    },

    display: function (id, data, frameStart, widthSum, stack, boundaries) {
      this.threads[id].threadHistogramView.display(data, boundaries);
    },

    histogramSelected: function (view, cb) {
    }
  };

  var HistogramView = function (debugName) {
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
      var step = Math.floor(this.boundaries.max / (width / 5));

      return { context: ctx, height: height, width: width, step: step };
    },

    display: function (data, boundaries) {
      this.data = data;
      this.boundaries = boundaries;
      this.render();

      var timeout;
      var throttler = function () {
        if (timeout)
          return;

        timeout = setTimeout(function () {
          timeout = null;
          this.dataIsOutdated();
          this.render();
          this.busyCover.classList.remove("busy");
        }.bind(this), 200);
      }.bind(this);

      window.addEventListener("resize", throttler, false);

      this.busyCover.classList.remove("busy");
    },

    render: function () {
      var info = this.getCanvas();
      var ctx = info.context;

      this.canvas.width = info.width;
      ctx.clearRect(0, 0, info.width, info.height);

      var curr = 0, x = 0;
      var data = JSON.parse(JSON.stringify(this.data));
      var slice, value, color;

      while (x <= info.width) {
        slice = [];
        for (var i = 0, datum; datum = data[i]; i++) {
          if (datum.time > curr) {
            break;
          }

          slice.push(datum);
        }

        if (slice.length !== 0) {
          data = data.slice(slice.length);
          value = slice.reduce(function (prev, curr) { return prev + curr.height }, 0) / slice.length;
          color = slice.reduce(function (prev, curr) { return prev + curr.color }, 0) / slice.length;
          ctx.fillStyle = "rgb(" + color + ",0,0)";
          var h  = (info.height / 100) * value;
          ctx.fillRect(x, info.height - h, 5, value * h);
        }

        curr += info.step;
        x += 5;
      }
    },

    dataIsOutdated: function () {
      this.busyCover.classList.add("busy");
    }
  };

  var RangeSelector = function (graph, histogram) {
    this.histogram = histogram;
    this.container = document.createElement("div", { className: "rangeSelectorContainer" });
    this.graph = graph;

    this.higlighter = createElement("div", { className: "histogramHilite collapsed" });
    this.container.appendChild(this.higlighter);

    this.mouseMarker = createElement("div", {
      className: "histogramMouseMarker",
      style: { left: "-500px" }
    });
    this.container.appendChild(this.mouseMarker);
  };

  RangeSelector.prototype = {
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

        // TODO: Save selected range
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

        updateSelectionMarker(coord.x, coord.y);
        ev.preventDefault();
      }.bind(this), false);

      this.graph.addEventListener("mouseup", function (ev) {
        this.graph.style.cursor = "default";
        isMouseDown = false;
      }.bind(this), false);

      this.graph.addEventListener("mousemove", function (ev) {
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

    updateMouseMarker: function (x) {
      x = x - this.graph.parentNode.getBoundingClientRect().left;
      this.mouseMarker.style.left = x + "px";
    },

    clearMouseMarker: function () {
      this.updateMouseMarker(-1);
    },

    drawSelectionMarker: function (x, y, width, height) {
      var hl = this.higlighter;
      hl.style.left = x + "px";
      hl.style.top = "0";
      hl.style.width = width + "px";
      hl.style.height = height + "px";
    }
  };
}());