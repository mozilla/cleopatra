/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var L10N = { ellipsis: "..." };

var HTML_NS = "http://www.w3.org/1999/xhtml";
var GRAPH_SRC = "chrome://browser/content/devtools/graphs-frame.xhtml";

var GRAPH_WHEEL_ZOOM_SENSITIVITY = 0.00035;
var GRAPH_WHEEL_SCROLL_SENSITIVITY = 0.5;
var GRAPH_MIN_SELECTION_WIDTH = 10; // ms

var TIMELINE_TICKS_MULTIPLE = 5; // ms
var TIMELINE_TICKS_SPACING_MIN = 75; // px

var OVERVIEW_HEADER_HEIGHT = 18; // px
var OVERVIEW_HEADER_SAFE_BOUNDS = 50; // px
var OVERVIEW_HEADER_TEXT_COLOR = "#18191a";
var OVERVIEW_HEADER_TEXT_FONT_SIZE = 9; // px
var OVERVIEW_HEADER_TEXT_FONT_FAMILY = "sans-serif";
var OVERVIEW_HEADER_TEXT_PADDING_LEFT = 6; // px
var OVERVIEW_HEADER_TEXT_PADDING_TOP = 5; // px
var OVERVIEW_TIMELINE_STROKES = "#ddd";

var FLAME_GRAPH_BLOCK_BORDER = 1; // px
var FLAME_GRAPH_BLOCK_TEXT_COLOR = "#000";
var FLAME_GRAPH_BLOCK_TEXT_FONT_SIZE = 9; // px
var FLAME_GRAPH_BLOCK_TEXT_FONT_FAMILY = "sans-serif";
var FLAME_GRAPH_BLOCK_TEXT_PADDING_TOP = 1; // px
var FLAME_GRAPH_BLOCK_TEXT_PADDING_LEFT = 3; // px
var FLAME_GRAPH_BLOCK_TEXT_PADDING_RIGHT = 3; // px

/**
 * A flamegraph visualization. This implementation is responsable only with
 * drawing the graph, using a data source consisting of rectangles and
 * their corresponding widths.
 *
 * Example usage:
 *   var graph = new FlameGraph(node);
 *   var src = FlameGraphUtils.createFlameGraphDataFromSamples(samples);
 *   graph.once("ready", () => {
 *     graph.setData(src);
 *   });
 *
 * Data source format:
 *   [
 *     {
 *       color: "string",
 *       blocks: [
 *         {
 *           x: number,
 *           y: number,
 *           width: number,
 *           height: number,
 *           text: "string"
 *         },
 *         ...
 *       ]
 *     },
 *     {
 *       color: "string",
 *       blocks: [...]
 *     },
 *     ...
 *     {
 *       color: "string",
 *       blocks: [...]
 *     }
 *   ]
 *
 * Use `FlameGraphUtils` to convert profiler data (or any other data source)
 * into a drawable format.
 *
 * @param nsIDOMNode parent
 *        The parent node holding the graph.
 * @param number sharpness [optional]
 *        Defaults to the current device pixel ratio.
 */
function FlameGraph(parent, sharpness) {
  //EventEmitter.decorate(this);

  var iframe = this._iframe = parent;

  this._parent = parent;
  this._ready = new Promise(function(resolve, reject) {
    this._iframe = iframe;
    this._window = window;
    this._pixelRatio = sharpness || this._window.devicePixelRatio;

    var container = this._container = this._iframe;
    container.className = "flame-graph-widget-container graph-widget-container";

    var canvas = this._canvas = document.createElement("canvas");
    container.appendChild(canvas);
    container.style.overflow = "hidden";
    canvas.className = "flame-graph-widget-canvas graph-widget-canvas";

    var bounds = parent.getBoundingClientRect();
    bounds.width = this.fixedWidth || bounds.width;
    bounds.height = this.fixedHeight || bounds.height;
    this._width = canvas.width = bounds.width * this._pixelRatio;
    this._height = canvas.height = bounds.height * this._pixelRatio;

    this._iframe.setAttribute("tabIndex", 0);

    this._ctx = canvas.getContext("2d");

    this._selection = new GraphSelection();
    this._selectionDragger = new GraphSelectionDragger();

    // Calculating text widths is necessary to trim the text inside the blocks
    // while the scaling changes (e.g. via scrolling). This is very expensive,
    // so maintain a cache of string contents to text widths.
    this._textWidthsCache = {};

    var fontSize = FLAME_GRAPH_BLOCK_TEXT_FONT_SIZE * this._pixelRatio;
    var fontFamily = FLAME_GRAPH_BLOCK_TEXT_FONT_FAMILY;
    this._averageCharWidth = this._calcAverageCharWidth();
    this._overflowCharWidth = this._getTextWidth(this.overflowChar);

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseWheel = this._onMouseWheel.bind(this);
    this._onAnimationFrame = this._onAnimationFrame.bind(this);

    this._window.addEventListener("mousemove", this._onMouseMove);
    this._iframe.addEventListener("mousedown", this._onMouseDown);
    this._window.addEventListener("mouseup", this._onMouseUp);
    this._iframe.addEventListener("wheel", this._onMouseWheel);

    this._iframe.addEventListener("keypress", this._onKeyPress.bind(this));

    this._animationId = this._window.requestAnimationFrame(this._onAnimationFrame);
    resolve(this);
  }.bind(this));

}

FlameGraph.prototype = {
  /**
   * Read-only width and height of the canvas.
   * @return number
   */
  get width() {
    return this._width;
  },
  get height() {
    return this._height;
  },

  ready: function() {
    return this._ready;
  },

  /**
   * Destroys this graph.
   */
  destroy: function() {
    var container = this._container;
    container.removeEventListener("mousemove", this._onMouseMove);
    container.removeEventListener("mousedown", this._onMouseDown);
    container.removeEventListener("mouseup", this._onMouseUp);
    container.removeEventListener("MozMousePixelScroll", this._onMouseWheel);

    this._window.cancelAnimationFrame(this._animationId);
    this._iframe.remove();

    this._selection = null;
    this._selectionDragger = null;

    this._data = null;

    this.emit("destroyed");
  },

  /**
   * Rendering options. Subclasses should override these.
   */
  overviewHeaderTextColor: OVERVIEW_HEADER_TEXT_COLOR,
  overviewTimelineStrokes: OVERVIEW_TIMELINE_STROKES,
  blockTextColor: FLAME_GRAPH_BLOCK_TEXT_COLOR,

  /**
   * Makes sure the canvas graph is of the specified width or height, and
   * doesn't flex to fit all the available space.
   */
  fixedWidth: null,
  fixedHeight: null,

  /**
   * The units used in the overhead ticks. Could be "ms", for example.
   * Overwrite this with your own localized format.
   */
  timelineTickUnits: "",

  /**
   * Character used when a block's text is overflowing.
   * Defaults to an ellipsis.
   */
  overflowChar: L10N.ellipsis,

  /**
   * Sets the data source for this graph.
   *
   * @param object data
   *        The data source. See the constructor for more information.
   */
  setData: function(data) {
    var minTime = null;
    var maxTime = null;
    var maxHeight = null;
    for (var i = 0; i < data.length; i++) {
      var blocks = data[i].blocks;
      for (var j = 0; j < blocks.length; j++) {
        var block = blocks[j];
        if (minTime === null || minTime > block.x) {
          minTime = block.x;
        }
        if (maxTime === null || maxTime < block.x + block.width) {
          maxTime = block.x + block.width;
        }
        if (maxHeight === null || maxHeight < block.y + block.height) {
          maxHeight = block.y + block.height;
        }
      }
    }

    this._viewRange = [minTime * this._pixelRatio, maxTime * this._pixelRatio];
    this._data = data;
    this._selection = {
      start: (minTime || 0) * this._pixelRatio,
      end: (maxTime || 1000) * this._pixelRatio,
      maxHeight: (maxHeight || 2000) * this._pixelRatio,
      offsetY: 0
    };
    this._shouldRedraw = true;
  },

  /**
   * Gets the start or end of this graph's selection, i.e. the 'data window'.
   * @return number
   */
  getDataWindowStart: function() {
    return this._selection.start / this._pixelRatio;
  },
  getDataWindowEnd: function() {
    return this._selection.end / this._pixelRatio;
  },

  /**
   * The contents of this graph are redrawn only when something changed,
   * like the data source, or the selection bounds etc. This flag tracks
   * if the rendering is "dirty" and needs to be refreshed.
   */
  _shouldRedraw: false,

  /**
   * Animation frame callback, invoked on each tick of the refresh driver.
   */
  _onAnimationFrame: function() {
    this._animationId = this._window.requestAnimationFrame(this._onAnimationFrame);
    this._drawWidget();
  },

  /**
   * Redraws the widget when necessary. The actual graph is not refreshed
   * every time this function is called, only the cliphead, selection etc.
   */
  _drawWidget: function() {
    this._normalizeSelectionBounds();

    var bounds = this._iframe.getBoundingClientRect();
    bounds.width = this.fixedWidth || bounds.width;
    bounds.height = this.fixedHeight || bounds.height;
    this._canvas.style.width = bounds.width + "px";
    this._canvas.style.height = bounds.height + "px";
    this._width = bounds.width * this._pixelRatio;
    this._height = bounds.height * this._pixelRatio;
    if (this._width != this._canvas.width) {
      this._canvas.width = this._width;
      this._shouldRedraw = true;
    }
    if (this._height != this._canvas.height) {
      this._canvas.height = this._height;
      this._shouldRedraw = true;
    }

    if (!this._shouldRedraw || this._data == null) {
      return;
    }

    var start = this._selection.start;
    var end = this._selection.end;
    gHistogramContainer.highlightTimeRange(start / this._pixelRatio, end / this._pixelRatio);

    var ctx = this._ctx;
    var canvasWidth = this._width;
    var canvasHeight = this._height;
    var selection = this._selection;
    var selectionWidth = selection.end - selection.start;
    var selectionScale = canvasWidth / selectionWidth;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    this._drawPyramid(this._data, selection.start, selectionScale);

    this._drawTicks(selection.start, selectionScale);

    this._shouldRedraw = false;
  },

  /**
   * Draws the overhead ticks in this graph.
   *
   * @param number dataOffset, dataScale
   *        Offsets and scales the data source by the specified amount.
   *        This is used for scrolling the visualization.
   */
  _drawTicks: function(dataOffset, dataScale) {
    var ctx = this._ctx;
    var canvasWidth = this._width;
    var canvasHeight = this._height;
    var scaledOffset = dataOffset * dataScale;

    var safeBounds = OVERVIEW_HEADER_SAFE_BOUNDS * this._pixelRatio;
    var availableWidth = canvasWidth - safeBounds;

    var fontSize = OVERVIEW_HEADER_TEXT_FONT_SIZE * this._pixelRatio;
    var fontFamily = OVERVIEW_HEADER_TEXT_FONT_FAMILY;
    var textPaddingLeft = OVERVIEW_HEADER_TEXT_PADDING_LEFT * this._pixelRatio;
    var textPaddingTop = OVERVIEW_HEADER_TEXT_PADDING_TOP * this._pixelRatio;
    var tickInterval = this._findOptimalTickInterval(dataScale);

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvasWidth, OVERVIEW_HEADER_HEIGHT * this._pixelRatio);

    ctx.textBaseline = "top";
    ctx.font = fontSize + "px " + fontFamily;
    ctx.fillStyle = this.overviewHeaderTextColor;
    ctx.strokeStyle = this.overviewTimelineStrokes;
    ctx.beginPath();

    for (var x = scaledOffset; x < availableWidth + scaledOffset; x += tickInterval) {
      var lineLeft = x - scaledOffset;
      var textLeft = lineLeft + textPaddingLeft;
      var time = Math.round(x / dataScale / this._pixelRatio);
      var label = time + " " + this.timelineTickUnits;
      ctx.fillText(label, textLeft, textPaddingTop);
      ctx.moveTo(lineLeft, 0);
      ctx.lineTo(lineLeft, canvasHeight);
    }

    ctx.stroke();
  },

  /**
   * Draws the blocks and text in this graph.
   *
   * @param object dataSource
   *        The data source. See the constructor for more information.
   * @param number dataOffset, dataScale
   *        Offsets and scales the data source by the specified amount.
   *        This is used for scrolling the visualization.
   */
  _drawPyramid: function(dataSource, dataOffset, dataScale) {
    var ctx = this._ctx;

    var fontSize = FLAME_GRAPH_BLOCK_TEXT_FONT_SIZE * this._pixelRatio;
    var fontFamily = FLAME_GRAPH_BLOCK_TEXT_FONT_FAMILY;
    var visibleBlocks = this._drawPyramidFill(dataSource, dataOffset, dataScale);

    ctx.textBaseline = "middle";
    ctx.font = fontSize + "px " + fontFamily;
    ctx.fillStyle = this.blockTextColor;

    this._drawPyramidText(visibleBlocks, dataOffset, dataScale);
  },

  /**
   * Fills all block inside this graph's pyramid.
   * @see FlameGraph.prototype._drawPyramid
   */
  _drawPyramidFill: function(dataSource, dataOffset, dataScale) {
    var visibleBlocksStore = [];
    var minVisibleBlockWidth = this._overflowCharWidth;

    for (var i = 0; i < dataSource.length; i++) {
      var color = dataSource[i].color;
      var blocks = dataSource[i].blocks;
      this._drawBlocksFill(
        color, blocks, dataOffset, dataScale,
        visibleBlocksStore, minVisibleBlockWidth);
    }

    return visibleBlocksStore;
  },

  /**
   * Adds the text for all block inside this graph's pyramid.
   * @see FlameGraph.prototype._drawPyramid
   */
  _drawPyramidText: function(blocks, dataOffset, dataScale) {
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      this._drawBlockText(block, dataOffset, dataScale);
    }
  },

  /**
   * Fills a group of blocks sharing the same style.
   *
   * @param string color
   *        The color used as the block's background.
   * @param array blocks
   *        A list of { x, y, width, height } objects visually representing
   *        all the blocks sharing this particular style.
   * @param number dataOffset, dataScale
   *        Offsets and scales the data source by the specified amount.
   *        This is used for scrolling the visualization.
   * @param array visibleBlocksStore
   *        An array to store all the visible blocks into, after drawing them.
   *        The provided array will be populated.
   * @param number minVisibleBlockWidth
   *        The minimum width of the blocks that will be added into
   *        the `visibleBlocksStore`.
   */
  _drawBlocksFill: function(
    color, blocks, dataOffset, dataScale,
    visibleBlocksStore, minVisibleBlockWidth)
  {
    var ctx = this._ctx;
    var canvasWidth = this._width;
    var canvasHeight = this._height;
    var scaledOffset = dataOffset * dataScale;

    ctx.fillStyle = color;
    ctx.beginPath();

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var x = block.x;
      var y = block.y
      var width = block.width;
      var height = block.height;
      var rectLeft = x * this._pixelRatio * dataScale - scaledOffset;
      var rectTop = (y + OVERVIEW_HEADER_HEIGHT - this._selection.offsetY) * this._pixelRatio;
      var rectWidth = width * this._pixelRatio * dataScale;
      var rectHeight = height * this._pixelRatio;

      if (rectLeft > canvasWidth || // Too far right.
          rectLeft < -rectWidth ||  // Too far left.
          rectTop > canvasHeight) { // Too far bottom.
        continue;
      }

      // Clamp the blocks position to start at 0. Avoid negative X coords,
      // to properly place the text inside the blocks.
      if (rectLeft < 0) {
        rectWidth += rectLeft;
        rectLeft = 0;
      }

      // Avoid drawing blocks that are too narrow.
      if (rectWidth <= FLAME_GRAPH_BLOCK_BORDER ||
          rectHeight <= FLAME_GRAPH_BLOCK_BORDER) {
        continue;
      }

      ctx.rect(
        rectLeft, rectTop,
        rectWidth - FLAME_GRAPH_BLOCK_BORDER,
        rectHeight - FLAME_GRAPH_BLOCK_BORDER);

      // Populate the visible blocks store with this block if the width
      // is longer than a given threshold.
      if (rectWidth > minVisibleBlockWidth) {
        visibleBlocksStore.push(block);
      }
    }

    ctx.fill();
  },

  /**
   * Adds text for a single block.
   *
   * @param object block
   *        A single { x, y, width, height, text } object visually representing
   *        the block containing the text.
   * @param number dataOffset, dataScale
   *        Offsets and scales the data source by the specified amount.
   *        This is used for scrolling the visualization.
   */
  _drawBlockText: function(block, dataOffset, dataScale) {
    var ctx = this._ctx;
    var scaledOffset = dataOffset * dataScale;

    var x = block.x;
    var y = block.y;
    var width = block.width;
    var height = block.height;
    var text = block.text;

    var paddingTop = (FLAME_GRAPH_BLOCK_TEXT_PADDING_TOP - this._selection.offsetY) * this._pixelRatio;
    var paddingLeft = FLAME_GRAPH_BLOCK_TEXT_PADDING_LEFT * this._pixelRatio;
    var paddingRight = FLAME_GRAPH_BLOCK_TEXT_PADDING_RIGHT * this._pixelRatio;
    var totalHorizontalPadding = paddingLeft + paddingRight;

    var rectLeft = x * this._pixelRatio * dataScale - scaledOffset;
    var rectWidth = width * this._pixelRatio * dataScale;

    // Clamp the blocks position to start at 0. Avoid negative X coords,
    // to properly place the text inside the blocks.
    if (rectLeft < 0) {
      rectWidth += rectLeft;
      rectLeft = 0;
    }

    var textLeft = rectLeft + paddingLeft;
    var textTop = (y + height / 2 + OVERVIEW_HEADER_HEIGHT) * this._pixelRatio + paddingTop;
    var textAvailableWidth = rectWidth - totalHorizontalPadding;

    // Massage the text to fit inside a given width. This clamps the string
    // at the end to avoid overflowing.
    var fittedText = this._getFittedText(text, textAvailableWidth);
    if (fittedText.length < 1) {
      return;
    }

    ctx.fillText(fittedText, textLeft, textTop);
  },

  /**
   * Calculating text widths is necessary to trim the text inside the blocks
   * while the scaling changes (e.g. via scrolling). This is very expensive,
   * so maintain a cache of string contents to text widths.
   */
  _textWidthsCache: null,
  _overflowCharWidth: null,
  _averageCharWidth: null,

  /**
   * Gets the width of the specified text, for the current context state
   * (font size, family etc.).
   *
   * @param string text
   *        The text to analyze.
   * @return number
   *         The text width.
   */
  _getTextWidth: function(text) {
    var cachedWidth = this._textWidthsCache[text];
    if (cachedWidth) {
      return cachedWidth;
    }
    var metrics = this._ctx.measureText(text);
    return (this._textWidthsCache[text] = metrics.width);
  },

  /**
   * Gets an approximate width of the specified text. This is much faster
   * than `_getTextWidth`, but inexact.
   *
   * @param string text
   *        The text to analyze.
   * @return number
   *         The approximate text width.
   */
  _getTextWidthApprox: function(text) {
    return text.length * this._averageCharWidth;
  },

  /**
   * Gets the average letter width in the English alphabet, for the current
   * context state (font size, family etc.). This provides a close enough
   * value to use in `_getTextWidthApprox`.
   *
   * @return number
   *         The average letter width.
   */
  _calcAverageCharWidth: function() {
    var letterWidthsSum = 0;
    var start = 32; // space
    var end = 123; // "z"

    for (var i = start; i < end; i++) {
      var char = String.fromCharCode(i);
      letterWidthsSum += this._getTextWidth(char);
    }

    return letterWidthsSum / (end - start);
  },

  /**
   * Massage a text to fit inside a given width. This clamps the string
   * at the end to avoid overflowing.
   *
   * @param string text
   *        The text to fit inside the given width.
   * @param number maxWidth
   *        The available width for the given text.
   * @return string
   *         The fitted text.
   */
  _getFittedText: function(text, maxWidth) {
    var textWidth = this._getTextWidth(text);
    if (textWidth < maxWidth) {
      return text;
    }
    if (this._overflowCharWidth > maxWidth) {
      return "";
    }
    for (var i = 1, len = text.length; i <= len; i++) {
      var trimmedText = text.substring(0, len - i);
      var trimmedWidth = this._getTextWidthApprox(trimmedText) + this._overflowCharWidth;
      if (trimmedWidth < maxWidth) {
        return trimmedText + this.overflowChar;
      }
    }
    return "";
  },

  /**
   * Listener for the "mousemove" event on the graph's container.
   */
  _onMouseMove: function(e) {
    var offset = this._getContainerOffset();
    var mouseX = (e.clientX - offset.left) * this._pixelRatio;
    var mouseY = (e.clientY - offset.top) * this._pixelRatio;

    var canvasWidth = this._width;
    var canvasHeight = this._height;

    var selection = this._selection;
    var selectionWidth = selection.end - selection.start;
    var selectionScale = canvasWidth / selectionWidth;

    var dragger = this._selectionDragger;
    if (dragger.originX != null) {
      var moveDeltaX = (dragger.originX - mouseX) / selectionScale;

      if (dragger.anchor.start + moveDeltaX <= this._viewRange[0]) {
        moveDeltaX = this._viewRange[0] - (dragger.anchor.start);
      } 
      if (dragger.anchor.end + moveDeltaX >= this._viewRange[1]) {
        moveDeltaX = this._viewRange[1] - (dragger.anchor.end);
      } 
      selection.start = dragger.anchor.start + moveDeltaX;
      selection.end = dragger.anchor.end + moveDeltaX;

      var moveDeltaY = (dragger.originY - mouseY) / this._pixelRatio;
      selection.offsetY = dragger.originOffsetY + moveDeltaY;

      if (selection.offsetY < 0) {
        selection.offsetY = 0;
      }
      if (selection.offsetY > this._selection.maxHeight) {
        selection.offsetY = this._selection.maxHeight;
      }

      this._normalizeSelectionBounds();

      this._shouldRedraw = true;
    }
  },

  _onKeyPress: function(e) {
    var key;

    if (e.code == "KeyW") {
      key = "w";
    } else if (e.code == "KeyS") {
      key = "s";
    } else if (e.code == "KeyA") {
      key = "a";
    } else if (e.code == "KeyD") {
      key = "d";
    } else {
      key = e.key || String.fromCharCode(e.keyCode || e.charCode);
    }

    var offset = this._getContainerOffset();
    if (key == "w") {
      this._onMouseWheel({clientX: offset.left + this.width / 2, deltaX: 0, deltaY: -100, deltaMode: WheelEvent.DOM_DELTA_PIXEL, preventDefault: function () {} });
    } else if (key == "s") {
      this._onMouseWheel({clientX: offset.left + this.width / 2, deltaX: 0, deltaY: 100, deltaMode: WheelEvent.DOM_DELTA_PIXEL, preventDefault: function () {} });
    } else if (key == "d") {
      this._onMouseWheel({clientX: offset.left + this.width / 2, deltaX: 100, deltaY: 0, deltaMode: WheelEvent.DOM_DELTA_PIXEL, preventDefault: function () {} });
    } else if (key == "a") {
      this._onMouseWheel({clientX: offset.left + this.width / 2, deltaX: -100, deltaY: 0, deltaMode: WheelEvent.DOM_DELTA_PIXEL, preventDefault: function () {} });
    }
  },

  /**
   * Listener for the "mousedown" event on the graph's container.
   */
  _onMouseDown: function(e) {
    var offset = this._getContainerOffset();
    var mouseX = (e.clientX - offset.left) * this._pixelRatio;
    var mouseY = (e.clientY - offset.top) * this._pixelRatio;

    this._selectionDragger.originX = mouseX;
    this._selectionDragger.originY = mouseY;
    this._selectionDragger.originOffsetY = this._selection.offsetY;
    this._selectionDragger.anchor.start = this._selection.start;
    this._selectionDragger.anchor.end = this._selection.end;
    this._canvas.setAttribute("input", "adjusting-selection-boundary");
  },

  /**
   * Listener for the "mouseup" event on the graph's container.
   */
  _onMouseUp: function() {
    this._selectionDragger.originX = null;
    this._selectionDragger.originY = null;
    this._canvas.removeAttribute("input");
  },

  /**
   * Listener for the "wheel" event on the graph's container.
   */
  _onMouseWheel: function(e) {
    e.preventDefault();

    var offset = this._getContainerOffset();
    var mouseX = (e.clientX - offset.left) * this._pixelRatio;

    var canvasWidth = this._width;
    var canvasHeight = this._height;

    var selection = this._selection;
    var selectionWidth = selection.end - selection.start;
    var selectionScale = canvasWidth / selectionWidth;

    function incrementForMode(mode) {
      switch (mode) {
        case WheelEvent.DOM_DELTA_PIXEL: return 1;
        case WheelEvent.DOM_DELTA_LINE: return 15;
        case WheelEvent.DOM_DELTA_PAGE: return 400;
      }
      return 0;
    }

    var distFromStart = mouseX;
    var distFromEnd = canvasWidth - mouseX;
    var vectorY = e.deltaY * incrementForMode(e.deltaMode) * GRAPH_WHEEL_ZOOM_SENSITIVITY / selectionScale;
    selection.start -= distFromStart * vectorY;
    selection.end += distFromEnd * vectorY;

    var vectorX = e.deltaX * incrementForMode(e.deltaMode) * GRAPH_WHEEL_SCROLL_SENSITIVITY / selectionScale;
    selection.start += vectorX;
    selection.end += vectorX;

    this._normalizeSelectionBounds();
    this._shouldRedraw = true;
  },

  /**
   * Makes sure the start and end points of the current selection
   * are withing the graph's visible bounds, and that they form a selection
   * wider than the allowed minimum width.
   */
  _normalizeSelectionBounds: function() {
    if (!this._viewRange) {
      return;
    }

    var start = this._selection.start;
    var end = this._selection.end;
    var minSelectionWidth = GRAPH_MIN_SELECTION_WIDTH * this._pixelRatio;

    if (start < this._viewRange[0]) {
      start = this._viewRange[0];
    }
    if (end > this._viewRange[1]) {
      end = this._viewRange[1];
    }

    this._selection.start = start;
    this._selection.end = end;
  },

  /**
   *
   * Finds the optimal tick interval between time markers in this graph.
   *
   * @param number dataScale
   * @return number
   */
  _findOptimalTickInterval: function(dataScale) {
    var timingStep = TIMELINE_TICKS_MULTIPLE;
    var spacingMin = TIMELINE_TICKS_SPACING_MIN * this._pixelRatio;

    if (dataScale > spacingMin) {
      return dataScale;
    }

    if (dataScale == 0) {
      return 1;
    }

    while (true) {
      var scaledStep = dataScale * timingStep;
      if (scaledStep < spacingMin) {
        timingStep <<= 1;
        continue;
      }
      return scaledStep;
    }
  },

  /**
   * Gets the offset of this graph's container relative to the owner window.
   *
   * @return object
   *         The { left, top } offset.
   */
  _getContainerOffset: function() {
    var node = this._canvas;
    var x = 0;
    var y = 0;

    while ((node = node.offsetParent)) {
      x += node.offsetLeft;
      y += node.offsetTop;
    }

    return { left: x, top: y };
  }
};

/**
 * A collection of utility functions converting various data sources
 * into a format drawable by the FlameGraph.
 */
var FlameGraphUtils = {
  // TODO bug 1077459
};


// Graph utils:

/**
 * Small data primitives for all graphs.
 */
window.GraphCursor = function() {};
window.GraphSelection = function() {};
window.GraphSelectionDragger = function() {};
window.GraphSelectionResizer = function() {};

GraphCursor.prototype = {
  x: null,
  y: null
};

GraphSelection.prototype = {
  start: null,
  end: null,
  offsetY: 0
};

GraphSelectionDragger.prototype = {
  origin: null,
  anchor: new GraphSelection()
};

GraphSelectionResizer.prototype = {
  margin: null
};


