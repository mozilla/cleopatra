function DiagnosticBar() {
  this._container = document.createElement("div");
  this._container.className = "diagnostic";
}

DiagnosticBar.prototype = {
  getContainer: function DiagnosticBar_getContainer() {
    return this._container;
  },
  display: function DiagnosticBar_display(data, filterByName, histogramData) {
    this._container.innerHTML = "";
    console.log(histogramData);
    if (!histogramData || histogramData.length < 1) return;

    var lastStep = histogramData[histogramData.length-1];
    var widthSum = lastStep.x + lastStep.width;
    console.log(" " + widthSum);
    var self = this;
    histogramData.forEach(function plotStep(step) {
      console.log(step.width + " " + widthSum);
      if (step.width / widthSum > 0.05) {
        //
        var diagnostic = document.createElement("a");
        diagnostic.style.position = "absolute";
        diagnostic.style.backgroundImage = "url('images/diagnostic/js.png')";
        diagnostic.style.width = step.width/widthSum*100 + "%";
        diagnostic.style.height = "100%";
        diagnostic.style.backgroundRepeat = "no-repeat";
        //diagnostic.style.backgroundAttachment = "fixed";
        diagnostic.style.backgroundPosition = "center";
        diagnostic.title = "Javascript";
        diagnostic.style.left = step.x/widthSum*100 + "%";
        self._container.appendChild(diagnostic);
      }
    });
    //this._container.innerHTML = w; //JSON.stringify(histogramData);
  },
};


