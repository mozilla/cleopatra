var HistogramContainer;

(function () {
  function createCanvas() {
    var canvas = document.createElement("canvas");
    canvas.height = 60;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    return canvas;
  }

  HistogramContainer = function () {
    this.container = document.createElement("table");
    this.container.className = "histogramContainer";
    this.container.style.width = "100%";
    this.container.style.height = "100%";
    this.container.border = "0";
    this.container.borderCollapse = "collapse";  
    this.container.cellPadding = "0";
    this.container.cellSpacing = "0";
    this.threads = [];
  }

  HistogramContainer.prototype = {
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
    },

    dataIsOutdated: function () {
    },

    showVideoFramePosition: function (frame) {
    },

    highlightedCallstackChanged: function (callstack) {
    },

    selectRange: function (start, end) {
    },

    display: function (id, data, frameStart, widthSum, stack, boundaries) {
      this.threads[id].threadHistogramView.display(data, boundaries);
    },

    updateInfoBar: function () {
    },

    histogramSelected: function (view, cb) {
    }
  };

  var HistogramView = function (debugName) {
    var container = document.createElement("div");
    container.className = "histogram";

    this.canvas = createCanvas();
    container.appendChild(this.canvas);

    this.rangeSelector = new RangeSelector(this.canvas, this);
    this.rangeSelector.enableRangeSelectionOnHistogram();
    container.appendChild(this.rangeSelector.container);

    this.busyCover = document.createElement("div");
    this.busyCover.className = "busyCover";
    container.appendChild(this.busyCover);

    this.debugName = debugName || "NoName";
    this.container = container;
    this.data = [];
  }

  HistogramView.prototype = {
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
          this.busyCover.classList.add("busy");
          this.render();
          this.busyCover.classList.remove("busy");
        }.bind(this), 200);
      }.bind(this);

      window.addEventListener("resize", throttler, false);

      this.busyCover.classList.remove("busy");
    },

    render: function () {
      var ctx = this.canvas.getContext("2d");
      var height = this.canvas.height;
      var width = parseInt(getComputedStyle(this.canvas, null).getPropertyValue("width"));

      this.canvas.width = width;
      ctx.clearRect(0, 0, width, height);

      var curr = 0, x = 0;
      var step = Math.floor(this.boundaries.max / (width / 5));
      var data = JSON.parse(JSON.stringify(this.data));
      var slice, value, color;

      while (x <= width) {
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
          var h  = (height / 100) * value;
          ctx.fillRect(x, height - h, 5, value * h);
        }

        curr += step;
        x += 5;
      }
    }
  };

  var RangeSelector = function (graph, histogram) {
    this.histogram = histogram;
    this.container = document.createElement("div");
    this.container.className = "rangeSelectorContainer";
    this.graph = graph;
  };

  RangeSelector.prototype = {
    enableRangeSelectionOnHistogram: function () {
    }
  };
}());