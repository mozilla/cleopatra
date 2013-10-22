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
    var str = " ";
    for (var i = 0; i < stack.length; i++) {
      var frame = stack[i];
      str += frame + "\n";
    }
    return str; 
  },

  display: function Waterfall_display(data) {
    this.busyCover.classList.remove("busy");
    var duration = data.boundaries.max - data.boundaries.min;

    this.container.innerHTML = "";

    for (var i = 0; i < data.items.length; i++) {
      var item = data.items[i];
      var startX = (item.startTime - data.boundaries.min) * 100 / duration;
      var width = (item.endTime - data.boundaries.min) * 100 / duration - startX;
      var itemTitle = (item.endTime - item.startTime).toFixed(2) + " ms";
      if (item.startTimerStack) {
        itemTitle += this.formatStack(item.startTimerStack);
      }
      var color = "rgb(250,100,40)";

      var startY = 0;
      if (item.text == "Layout") {
        startY = 15;
        color = "rgb(150,40,100)";
      }
      if (item.text == "Rasterize") {
        startY = 30;
        color = "rgb(100,250,40)";
      }
      if (item.text == "Composite") {
        startY = 45;
        color = "rgb(100,40,250)";
      }
      var itemElem = createElement("div", {
        className: "waterfallItem",
        innerHTML: "<center>" + item.text + "</center>",
        title: itemTitle,
        style: {
          overflow: "hidden",
          position: "absolute",
          left: startX + "%",
          top: startY + "px",
          width: width + "%",
          border: "solid 1px",
          background: color,
          borderRadius: "3px",
        },
      });
      this.container.appendChild(itemElem);
    }

  },
};
