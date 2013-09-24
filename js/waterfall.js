// Test profile: e74815d8695ccf8580d4af3be5cd1371f202f6ae

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

var Waterfall = function() {
  this.container = createElement("div", {
    className: "waterfallContainer histogram",
  });
  this.canvas = createElement("canvas", {
    className: "waterfallCanvas",
  });
  this.busyCover = createElement("div", { className: "busyCover" });
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


Waterfall.prototype = {
  getContainer: function Waterfall_getContainer() {
    return this.container;
  },

  scheduleRender: function () {
    var fn = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
      window.webkitAnimationFrame || window.msRequestAnimationFrame;

    fn(this.display.bind(this));
  },

  dataIsOutdated: function() {
    this.busyCover.classList.add("busy");
  },

  display: function Waterfall_display() {
    this.busyCover.classList.remove("busy");
    var width = parseInt(getComputedStyle(this.canvas, null).getPropertyValue("width"));
    this.canvas.width = width;

  },
};
