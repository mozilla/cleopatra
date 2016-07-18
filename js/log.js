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
      overflow: "auto",
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
        logEntry: logEntry,
        onmouseover: function() {
          if (this.mouseOverMarker) {
            return;
          }
          this.mouseOverMarker = window.gHistogramContainer.addMarker("Log", this.logEntry.thread, this.logEntry.time);
          if (this.logEntry.name.lastIndexOf("data:image/png;base64,", 0) === 0) {
            this.preview = createElement("img", {
              src: this.logEntry.name,
              style: {
                border: "solid 1px black",
                backgroundColor: "#FFF",
                backgroundImage: "linear-gradient(45deg, #F0F 25%, transparent 25%,transparent 75%, #F0F 75%, #F0F 100%), linear-gradient(45deg, #F0F 25%, transparent 25%,transparent 75%, #F0F 75%, #F0F 100%)",
                backgroundSize: "32px 32px",
                backgroundPosition: "0 0, 16px 16px",
                position: "absolute",
                top: "0px",
                left: "0px",
              },
            });
            document.body.appendChild(this.preview);
          }
        },
        onmouseout: function() {
          if (this.mouseOverMarker) {
            window.gHistogramContainer.removeMarker(this.mouseOverMarker);
            this.mouseOverMarker = null;
          }
          if (this.preview) {
            document.body.removeChild(this.preview);
            this.preview = null;
          }
        },
      });
      this.logWidget.appendChild(logLine);
    }
  },
};

