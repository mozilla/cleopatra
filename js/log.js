var GeckoLogHandler = function() {
  this.container = createElement("div", {
    className: "logContainer",
    style: {
      height: "100%",
      overflow: "scroll",
    },
  });

  this.logWidget = createElement("div", {
    className: "logWidget",
    style: {
      background: "linear-gradient(#FFF, #FFF 50%, #F0F5FF 50%, #F0F5FF) repeat scroll 0% 0% / 100px 32px transparent",
      lineHeight: "16px",
      paddingLeft: "2px",
      minHeight: "100%",
    }
  });
  this.container.appendChild(this.logWidget);

  //this.busyCover = createElement("div", { className: "busyCover" });
  //this.busyCover.classList.add("busy");
  //this.container.appendChild(this.busyCover);
}

GeckoLogHandler.prototype = {
  getContainer: function GeckoLogHandler_getContainer() {
    return this.container;
  },
  setLogData: function GeckoLogHandler_setLogData(data) {
    this.logWidget.innerHTML = ""; // clear
    for (var i = 0; i < data.entries.length; i++) {
      var logEntry = data.entries[i];
      var logLine = createElement("div", {
        className: "logLine",
        textContent: logEntry.name,
      });
      this.logWidget.appendChild(logLine);
    }
  },
};

