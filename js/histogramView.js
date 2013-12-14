'use strict';

(function(window) {
  function HistogramView() {
    this._container = document.createElement("div");
    this._container.className = "histogram";

    this._canvas = this._createCanvas();
    this._container.appendChild(this._canvas);

    this._rangeSelector = new RangeSelector(this._canvas, this);
    this._rangeSelector.enableRangeSelectionOnHistogram();
    this._container.appendChild(this._rangeSelector.getContainer());

    this._busyCover = document.createElement("div");
    this._busyCover.className = "busyCover";
    this._container.appendChild(this._busyCover);

    this._histogramData = [];
  }
  HistogramView.prototype = {
    dataIsOutdated: function HistogramView_dataIsOutdated() {
      this._busyCover.classList.add("busy");
    },
    _createCanvas: function HistogramView__createCanvas() {
      var canvas = document.createElement("canvas");
      canvas.height = 60;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      return canvas;
    },
    getContainer: function HistogramView_getContainer() {
      return this._container;
    },
    selectRange: function HistogramView_selectRange(start, end) {
      this._rangeSelector._finishSelection(start, end);
    },
    showVideoFramePosition: function HistogramView_showVideoFramePosition(frame) {
      if (!this._frameStart || !this._frameStart[frame])
        return;
      var frameStart = this._frameStart[frame];
      // Now we look for the frame end. Because we can swap frame we don't present we have to look ahead
      // in the stream if frame+1 doesn't exist.
      var frameEnd = this._frameStart[frame+1];
      for (var i = 0; i < 10 && !frameEnd; i++) {
        frameEnd = this._frameStart[frame+1+i];
      }
      this._rangeSelector.showVideoRange(frameStart, frameEnd);
    },
    showVideoPosition: function HistogramView_showVideoPosition(position) {
      // position in 0..1
      this._rangeSelector.showVideoPosition(position);
    },
    _gatherMarkersList: function HistogramView__gatherMarkersList(histogramData) {
      var markers = [];
      for (var i = 0; i < histogramData.length; ++i) {
        var step = histogramData[i];
        if ("marker" in step) {
          markers.push({
            index: i,
            name: step.marker
          });
        }
      }
      return markers;
    },
    _calculateWidthMultiplier: function () {
      var minWidth = 2000;
      return Math.ceil(minWidth / this._widthSum);
    },
    histogramClick: function HistogramView_histogramClick(index) {
      var sample = this._histogramData[index]; 
      var frames = sample.frames;
      var list = gSampleBar.setSample(frames[0]);
      gTreeManager.setSelection(list);
      setHighlightedCallstack(frames[0], frames[0]);
    },
    display: function HistogramView_display(histogramData, frameStart, widthSum, highlightedCallstack) {
      this._histogramData = histogramData;
      this._frameStart = frameStart;
      this._widthSum = widthSum;
      this._widthMultiplier = this._calculateWidthMultiplier();
      this._canvas.width = this._widthMultiplier * this._widthSum;
      this._render(highlightedCallstack);
      this._busyCover.classList.remove("busy");
    },
    _scheduleRender: function HistogramView__scheduleRender(highlightedCallstack) {
      var self = this;
      if (self._pendingAnimationFrame != null) {
        return;
      }
      self._pendingAnimationFrame = requestAnimationFrame(function anim_frame() {
        cancelAnimationFrame(self._pendingAnimationFrame);
        self._pendingAnimationFrame = null;
        self._render(highlightedCallstack);
      });
    },
    _render: function HistogramView__render(highlightedCallstack) {
      var ctx = this._canvas.getContext("2d");
      var height = this._canvas.height;
      ctx.setTransform(this._widthMultiplier, 0, 0, 1, 0, 0);
      ctx.font = "20px Georgia";
      ctx.clearRect(0, 0, this._widthSum, height);

      var self = this;
      var markerCount = 0;
      for (var i = 0; i < this._histogramData.length; i++) {
        var step = this._histogramData[i];
        var isSelected = self._isStepSelected(step, highlightedCallstack);
        var isInRangeSelector = self._isInRangeSelector(i);
        if (isSelected) {
          ctx.fillStyle = "green";
        } else if (isInRangeSelector) {
          ctx.fillStyle = "blue";
        } else {
          ctx.fillStyle = step.color;
        }
        var roundedHeight = Math.round(step.value * height);
        ctx.fillRect(step.x, height - roundedHeight, step.width, roundedHeight);
        if (step.marker) {
          var x = step.x + step.width + 2;
          var endPoint = x + ctx.measureText(step.marker).width;
          var lastDataPoint = this._histogramData[this._histogramData.length-1];
          if (endPoint >= lastDataPoint.x + lastDataPoint.width) {
            x -= endPoint - (lastDataPoint.x + lastDataPoint.width) - 1;
          }
          ctx.fillText(step.marker, x, 15 + ((markerCount % 2) == 0 ? 0 : 20));
          markerCount++;
        }
      }

      this._finishedRendering = true;
    },
    highlightedCallstackChanged: function HistogramView_highlightedCallstackChanged(highlightedCallstack) {
      this._scheduleRender(highlightedCallstack);
    },
    _isInRangeSelector: function HistogramView_isInRangeSelector(index) {
      return false;
    },
    _isStepSelected: function HistogramView__isStepSelected(step, highlightedCallstack) {
      if ("marker" in step)
        return false;

      search_frames: for (var i = 0; i < step.frames.length; i++) {
        var frames = step.frames[i];

        if (frames.length < highlightedCallstack.length ||
            highlightedCallstack.length <= (gInvertCallstack ? 0 : 1))
          continue;

        var compareFrames = frames;
        if (gInvertCallstack) {
          for (var j = 0; j < highlightedCallstack.length; j++) {
            var compareFrameIndex = compareFrames.length - 1 - j;
            if (highlightedCallstack[j] != compareFrames[compareFrameIndex]) {
              continue search_frames;
            }
          }
        } else {
          for (var j = 0; j < highlightedCallstack.length; j++) {
            var compareFrameIndex = j;
            if (highlightedCallstack[j] != compareFrames[compareFrameIndex]) {
              continue search_frames;
            }
          }
        }
        return true;
      };
      return false;
    },
    getHistogramData: function HistogramView__getHistogramData() {
      return this._histogramData;
    },
    _getStepColor: function HistogramView__getStepColor(step) {
        if ("responsiveness" in step.extraInfo) {
          var res = step.extraInfo.responsiveness;
          var redComponent = Math.round(255 * Math.min(1, res / kDelayUntilWorstResponsiveness));
          return "rgb(" + redComponent + ",0,0)";
        }

        return "rgb(0,0,0)";
    },
  };

  function RangeSelector(graph, histogram) {
    this._histogram = histogram;
    this.container = document.createElement("div");
    this.container.className = "rangeSelectorContainer";
    this._graph = graph;
    this._selectedRange = { startX: 0, endX: 0 };
    this._selectedSampleRange = { start: 0, end: 0 };

    this._highlighter = document.createElement("div");
    this._highlighter.className = "histogramHilite collapsed";
    this.container.appendChild(this._highlighter);

    this._mouseMarker = document.createElement("div");
    this._mouseMarker.className = "histogramMouseMarker";
    this.container.appendChild(this._mouseMarker);
  }
  RangeSelector.prototype = {
    getContainer: function RangeSelector_getContainer() {
      return this.container;
    },
    // echo the location off the mouse on the histogram
    drawMouseMarker: function RangeSelector_drawMouseMarker(x) {
      console.log("Draw");
      var mouseMarker = this._mouseMarker;
      mouseMarker.style.left = x + "px";
    },
    showVideoPosition: function RangeSelector_showVideoPosition(position) {
      this.drawMouseMarker(position * (this._graph.parentNode.clientWidth-1));
      PROFILERLOG("Show video position: " + position);
    },
    drawHiliteRectangle: function RangeSelector_drawHiliteRectangle(x, y, width, height) {
      var hilite = this._highlighter;
      hilite.style.left = x + "px";
      hilite.style.top = "0";
      hilite.style.width = width + "px";
      hilite.style.height = height + "px";
    },
    clearCurrentRangeSelection: function RangeSelector_clearCurrentRangeSelection() {
      try {
        this.changeEventSuppressed = true;
        var children = this.selector.childNodes;
        for (var i = 0; i < children.length; ++i) {
          children[i].selected = false;
        }
      } finally {
        this.changeEventSuppressed = false;
      }
    },
    showVideoRange: function RangeSelector_showVideoRange(startIndex, endIndex) {
      if (!endIndex || endIndex < 0)
        endIndex = gCurrentlyShownSampleData.length;

      var len = this._graph.parentNode.getBoundingClientRect().right - this._graph.parentNode.getBoundingClientRect().left;
      this._selectedRange.startX = startIndex * len / this._histogram._histogramData.length;
      this._selectedRange.endX = endIndex * len / this._histogram._histogramData.length;
      var width = this._selectedRange.endX - this._selectedRange.startX;
      var height = this._graph.parentNode.clientHeight;
      this._highlighter.classList.remove("collapsed");
      this.drawHiliteRectangle(this._selectedRange.startX, 0, width, height);
      //this._finishSelection(startIndex, endIndex);
    },
    enableRangeSelectionOnHistogram: function RangeSelector_enableRangeSelectionOnHistogram() {
      var graph = this._graph;
      var isDrawingRectangle = false;
      var origX, origY;
      var self = this;
      // Compute this on the mouse down rather then forcing a sync reflow
      // every frame.
      var boundingRect = null;
      function histogramClick(clickX, clickY) {
        clickX = Math.min(clickX, graph.parentNode.getBoundingClientRect().right);
        clickX = clickX - graph.parentNode.getBoundingClientRect().left;
        var index = self._histogramIndexFromPoint(clickX);
        self._histogram.histogramClick(index);
      }
      function updateHiliteRectangle(newX, newY) {
        newX = Math.min(newX, boundingRect.right);
        var startX = Math.min(newX, origX) - boundingRect.left;
        var startY = 0;
        var width = Math.abs(newX - origX);
        var height = graph.parentNode.clientHeight;
        if (startX < 0) {
          width += startX;
          startX = 0;
        }
        self._selectedRange.startX = startX;
        self._selectedRange.endX = startX + width;
        self.drawHiliteRectangle(startX, startY, width, height);
      }
      function updateMouseMarker(newX) {
        self.drawMouseMarker(newX - graph.parentNode.getBoundingClientRect().left);
      }
      graph.addEventListener("mousedown", function(e) {
        if (e.button != 0)
          return;
        graph.style.cursor = "col-resize";
        isDrawingRectangle = true;
        self.beginHistogramSelection();
        origX = e.pageX;
        origY = e.pageY;
        boundingRect = graph.parentNode.getBoundingClientRect();
        if (this.setCapture)
          this.setCapture();
        // Reset the highlight rectangle
        updateHiliteRectangle(e.pageX, e.pageY);
        e.preventDefault();
        this._movedDuringClick = false;
      }, false);
      graph.addEventListener("mouseup", function(e) {
        graph.style.cursor = "default";
        if (!this._movedDuringClick) {
          isDrawingRectangle = false;
          // Handle as a click on the histogram. Select the sample:
          histogramClick(e.pageX, e.pageY);
        } else if (isDrawingRectangle) {
          isDrawingRectangle = false;
          updateHiliteRectangle(e.pageX, e.pageY);
          self.finishHistogramSelection(e.pageX != origX);
          if (e.pageX == origX) {
            // Simple click in the histogram
            var index = self._sampleIndexFromPoint(e.pageX - graph.parentNode.getBoundingClientRect().left);
            // TODO Select this sample in the tree view
            var sample = gCurrentlyShownSampleData[index];
          }
        }
      }, false);
      graph.addEventListener("mousemove", function(e) {
        this._movedDuringClick = true;
        if (isDrawingRectangle) {
          updateMouseMarker(-1); // Clear
          updateHiliteRectangle(e.pageX, e.pageY);
        } else {
          updateMouseMarker(e.pageX);
        }
      }, false);
      graph.addEventListener("mouseout", function(e) {
        updateMouseMarker(-1); // Clear
      }, false);
    },
    beginHistogramSelection: function RangeSelector_beginHistgramSelection() {
      var hilite = this._highlighter;
      hilite.classList.remove("finished");
      hilite.classList.add("selecting");
      hilite.classList.remove("collapsed");
      if (this._transientRestrictionEnteringAffordance) {
        this._transientRestrictionEnteringAffordance.discard();
      }
    },
    _finishSelection: function RangeSelector__finishSelection(start, end) {
      var newFilterChain = gSampleFilters.concat({ type: "RangeSampleFilter", start: start, end: end });
      var self = this;
      self._transientRestrictionEnteringAffordance = gBreadcrumbTrail.add({
        title: "Sample Range [" + start + ", " + (end + 1) + "]",
        enterCallback: function () {
          gSampleFilters = newFilterChain;
          self.collapseHistogramSelection();
          filtersChanged();
        }
      });
    },
    finishHistogramSelection: function RangeSelector_finishHistgramSelection(isSomethingSelected) {
      var self = this;
      var hilite = this._highlighter;
      hilite.classList.remove("selecting");
      if (isSomethingSelected) {
        hilite.classList.add("finished");
        var start = this._sampleIndexFromPoint(this._selectedRange.startX);
        var end = this._sampleIndexFromPoint(this._selectedRange.endX);
        self._finishSelection(start, end);
      } else {
        hilite.classList.add("collapsed");
      }
    },
    collapseHistogramSelection: function RangeSelector_collapseHistogramSelection() {
      var hilite = this._highlighter;
      hilite.classList.add("collapsed");
    },
    _sampleIndexFromPoint: function RangeSelector__sampleIndexFromPoint(x) {
      // XXX this is completely wrong, fix please
      var totalSamples = parseFloat(gCurrentlyShownSampleData.length);
      var width = parseFloat(this._graph.parentNode.clientWidth);
      var factor = totalSamples / width;
      return parseInt(parseFloat(x) * factor);
    },
    _histogramIndexFromPoint: function RangeSelector__histogramIndexFromPoint(x) {
      // XXX this is completely wrong, fix please
      var totalSamples = parseFloat(this._histogram._histogramData.length);
      var width = parseFloat(this._graph.parentNode.clientWidth);
      var factor = totalSamples / width;
      return parseInt(parseFloat(x) * factor);
    },
  };

  function videoPaneTimeChange(video) {
    if (!gMeta || !gMeta.frameStart)
      return;

    var frame = gVideoPane.getCurrentFrameNumber();
    //var frameStart = gMeta.frameStart[frame];
    //var frameEnd = gMeta.frameStart[frame+1]; // If we don't have a frameEnd assume the end of the profile

    gHistogramView.showVideoFramePosition(frame); 
  }


  window.onpopstate = function(ev) {
    return; // Conflicts with document url
    if (!gBreadcrumbTrail)
      return;
    console.log("pop: " + JSON.stringify(ev.state));
    gBreadcrumbTrail.pop();
    if (ev.state) {
      console.log("state");
      if (ev.state.action === "popbreadcrumb") {
        console.log("bread");
        //gBreadcrumbTrail.pop();
      }
    }
  }

  function maxResponsiveness() {
    var data = gCurrentlyShownSampleData;
    var maxRes = 0.0;
    for (var i = 0; i < data.length; ++i) {
      if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["responsiveness"])
        continue;
      if (maxRes < data[i].extraInfo["responsiveness"])
        maxRes = data[i].extraInfo["responsiveness"];
    }
    return maxRes;
  }

  window.HistogramView = HistogramView;
}(this));