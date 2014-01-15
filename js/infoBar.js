'use strict';

(function(window) {
  function InfoBar() {
    this._container = document.createElement("div");
    this._container.id = "infoBar";
    this._container.className = "sideBar";
  }

  InfoBar.prototype = {
    handleEvent: function InfoBar_handleEvent(evt) {
      switch (evt.target.id) {
        case 'download':
          this.downloadProfile();
          break;

        case 'upload':
        case 'upload_select':
          this.promptUploadProfile();
          break;

        case 'showJS':
          this.toggleJavascriptOnly();
          break;

        case 'showPowerInfo':
          this.toggleShowPowerInfo();
          break;

        case 'txtPeakPower':
          this.changePeakPower();
          break;

        case 'showFrames':
          this.toggleShowFrames();
          break;

        case 'invertCallstack':
          this.toggleInvertCallStack();
          break;

        case 'showMissedSample':
          this.toggleShowMissedSample();
          break;

        case 'showJank':
          this.toggleJank();
          break;

        case 'mergeFunctions':
          break;

        case 'compare':
          this.openProfileCompare();
          break;
      }
    },
    getContainer: function InfoBar_getContainer() {
      return this._container;
    },
    getMetaFeatureString: function InfoBar_getMetaFeatureString() {
      var features = "<dt>Stackwalk:</dt><dd>" + (gMeta.stackwalk ? "True" : "False") + "</dd>";
      features += "<dt>Jank:</dt><dd>" + (gMeta.jank ? "True" : "False") + "</dd>";
      features += "<dt>Frames:</dt><dd>" + (gMeta.frameStart && Object.keys(gMeta.frameStart).length > 0 ? "True" : "False") + "</dd>";
      return features;
    },
    getPlatformInfo: function InfoBar_getPlatformInfo() {
      return gMeta.oscpu + " (" + gMeta.toolkit + ")";
    },
    display: function InfoBar_display() {
      var infobar = this._container;
      var infoText = "";

      if (gMeta) {
        infoText += "<h2>Profile Info</h2>\n<dl>\n";
        infoText += "<dt>Product:</dt><dd>" + gMeta.product + "</dd>";
        infoText += "<dt>Platform:</dt><dd>" + this.getPlatformInfo() + "</dd>";
        infoText += this.getMetaFeatureString();
        infoText += "<dt>Interval:</dt><dd>" + gMeta.interval + " ms</dd></dl>";
      }
      infoText += "<h2>Selection Info</h2>\n<dl>\n";
      infoText += "  <dt>Avg. Event Lag:</dt><dd>" + this.avgResponsiveness().toFixed(2) + " ms</dd>\n";
      infoText += "  <dt>Max Event Lag:</dt><dd>" + this.maxResponsiveness().toFixed(2) + " ms</dd>\n";
      infoText += "  <dt>Real Interval:</dt><dd>" + this.effectiveInterval() + "</dd>";
      if (gMeta && gMeta.hasPowerInfo) {
        infoText += "  <dt>Work:</dt><dd>" + this.totalPowerStr() + "</dd>";
        infoText += "  <dt>Peak:</dt><dd>" + this.peakPower() + " Watt</dd>";
      }
      infoText += "</dl>\n";
      infoText += "<h2>Pre Filtering</h2>\n";
      // Disable for now since it's buggy and not useful
      //infoText += "<label><input type='checkbox' id='mergeFunctions' " + (gMergeFunctions ?" checked='true' ":" ") + " />Functions, not lines</label><br>\n";

      var filterNameInputOld = document.getElementById("filterName");
      infoText += "<a>Filter:\n";
      infoText += "<input type='search' id='filterName' oninput='window.AppUI.filterOnChange()'/></a>\n";

      infoText += "<h2>Post Filtering</h2>\n";
      infoText += "<label><input type='checkbox' id='showJank' " + (gJankOnly ?" checked='true' ":" ") + " />Show Jank only</label>\n";
      infoText += "<h2>View Options</h2>\n";
      infoText += "<label><input type='checkbox' id='showJS' " + (gJavascriptOnly ?" checked='true' ":" ") + " />Javascript only</label><br>\n";
      infoText += "<label><input type='checkbox' id='mergeUnbranched' " + (gMergeUnbranched ?" checked='true' ":" ") + " />Merge unbranched call paths</label><br>\n";
      infoText += "<label><input type='checkbox' id='invertCallstack' " + (gInvertCallstack ?" checked='true' ":" ") + " />Invert callstack</label><br>\n";
      infoText += "<label><input type='checkbox' id='showFrames' " + (gShowFrames ?" checked='true' ":" ") + " />Show Frames Boundaries</label><br>\n";
      infoText += "<label><input type='checkbox' id='showMissedSample' " + (gShowMissedSample ?" checked='true' ":" ") + " />Show Missed Sample</label>\n";
      if (gMeta && gMeta.hasPowerInfo) {
        infoText += "<br><label><input type='checkbox' id='showPowerInfo' " + (gShowPowerInfo ?" checked='true' ":" ") + " />Show Power</label>\n";
        infoText += "<br>Peak Color: <label><input type='textbox' id='txtPeakPower' value='"+gPeakPower+"' >Watts</input></label>";
      }

      infoText += "<h2>Share With URL</h2>\n";
      infoText += "<div id='upload_status' aria-live='polite'>No upload in progress</div><br>\n";
      infoText += "<input type='button' id='upload' value='Share'>\n";
      // For now upload view is disabled because it's rarely what users want to do
      //infoText += "<input type='button' id='upload_select' value='Upload view'><br>\n";
      infoText += "<input type='button' id='download' value='Save to Local File'>\n";

      infoText += "<h2>Compare</h2>\n";
      infoText += "<input type='button' id='compare' value='Compare'>\n";

      //infoText += "<br>\n";
      //infoText += "Skip functions:<br>\n";
      //infoText += "<select size=8 id='skipsymbol'></select><br />"
      //infoText += "<input type='button' id='delete_skipsymbol' value='Delete'/><br />\n";
      //infoText += "<input type='button' id='add_skipsymbol' value='Add'/><br />\n";
      
      infobar.innerHTML = infoText;
      this.addTooltips();

      var filterNameInputNew = document.getElementById("filterName");
      if (filterNameInputOld != null && filterNameInputNew != null) {
        filterNameInputNew.parentNode.replaceChild(filterNameInputOld, filterNameInputNew);
        //filterNameInputNew.value = filterNameInputOld.value;
      } else if (gQueryParamFilterName != null) {
        filterNameInputNew.value = gQueryParamFilterName;
        gQueryParamFilterName = null;
      }
      document.getElementById('compare').addEventListener('click', this);
      document.getElementById('upload').addEventListener('click', this);
      document.getElementById('download').addEventListener('click', this);
      document.getElementById('showJank').addEventListener('change', this);
      document.getElementById('showJS').addEventListener('change', this);
      document.getElementById('mergeUnbranched').addEventListener('change', this);
      document.getElementById('showFrames').addEventListener('change', this);
      document.getElementById('invertCallstack').addEventListener('change', this);
      document.getElementById('showMissedSample').addEventListener('change', this);
      if (document.getElementById('upload_select') != null) {
        document.getElementById('upload_select').addEventListener('click', this);
      }
      if (gMeta && gMeta.hasPowerInfo) {
        document.getElementById('showPowerInfo').addEventListener('change', this);
        document.getElementById('txtPeakPower').addEventListener('change', this);
      }
      //document.getElementById('delete_skipsymbol').onclick = delete_skip_symbol;
      //document.getElementById('add_skipsymbol').onclick = add_skip_symbol;

      //this.populate_skip_symbol();
    },

    openProfileCompare: function InfoBar_openProfileCompare() {
      new ProfileComparator(document.body);
    },

    promptUploadProfile: function InfoBar_promptUploadProfile() {
      /**
       * @todo Decouple Cleopatra
       */
      
      Cleopatra.promptUploadProfile();
    },

    downloadProfile: function InfoBar_downloadProfile() {
      Parser.getSerializedProfile(true, function (serializedProfile) {
        var blob = new Blob([serializedProfile], { "type": "application/octet-stream" });
        location.href = window.URL.createObjectURL(blob);
      });
    },

    toggleJavascriptOnly: function InfoBar_toggleJavascriptOnly() {
      if (gJavascriptOnly) {
        // When going from JS only to non js there's going to be new C++
        // frames in the selection so we need to restore the selection
        // while allowing non contigous symbols to be in the stack (the c++ ones)
        gTreeManager.setAllowNonContigous();
      }
      gJavascriptOnly = !gJavascriptOnly;
      gTreeManager.saveSelectionSnapshot(gJavascriptOnly);
      window.dispatchEvent(new CustomEvent('filters-changed'));
    },

    toggleInvertCallStack: function InfoBar_toggleInvertCallStack() {
      gTreeManager.saveReverseSelectionSnapshot(gJavascriptOnly);
      gInvertCallstack = !gInvertCallstack;
      var startTime = Date.now();
      AppUI.viewOptionsChanged();
      console.log("invert time: " + (Date.now() - startTime) + "ms");
    },

    toggleMergeUnbranched: function InfoBar_toggleMergeUnbranched() {
      gMergeUnbranched = !gMergeUnbranched;
      AppUI.viewOptionsChanged(); 
    },

    toggleJank: function InfoBar_toggleJank(/* optional */ threshold) {
      // Currently we have no way to change the threshold in the UI
      // once we add this we will need to change the tooltip.
      gJankOnly = !gJankOnly;
      if (threshold != null ) {
        gJankThreshold = threshold;
      }
      window.dispatchEvent(new CustomEvent('filters-changed'));
    },

    toggleShowMissedSample: function InfoBar_toggleShowMissedSample() {
      gShowMissedSample = !gShowMissedSample;
      window.dispatchEvent(new CustomEvent('filters-changed'));
    },

    changePeakPower: function InfoBar_changePeakPower() {
      gPeakPower = parseInt(document.getElementById("txtPeakPower").value)
    },

    toggleShowPowerInfo: function InfoBar_toggleShowPowerInfo() {
      gShowPowerInfo = !gShowPowerInfo;
      window.dispatchEvent(new CustomEvent('filters-changed'));
    },

    toggleShowFrames: function InfoBar_toggleShowFrames() {
      gShowFrames = !gShowFrames;
      window.dispatchEvent(new CustomEvent('filters-changed'));
    },

    addTooltips: function InfoBar_addTooltips() {
      var tooltip = {
        "mergeFunctions" : "Ignore line information and merge samples based on function names.",
        "showJank" : "Show only samples with >50ms responsiveness.",
        "showJS" : "Show only samples which involve running chrome or content Javascript code.",
        "showFrames" : "Show the frame boundary in the timeline as blue lines. Profile must be recorded with pref 'layers.acceleration.frame-counter'",
        "showMissedSample" : "Leave a gap in the timeline if when a sample could not be collected in time.",
        "mergeUnbranched" : "Collapse unbranched call paths in the call tree into a single node.",
        "filterName" : "Show only samples with a frame containing the filter as a substring.",
        "invertCallstack" : "Invert the callstack (Heavy view) to find the most expensive leaf functions.",
        "upload" : "Upload the full performance profile to public cloud storage to share with others.",
        "upload_select" : "Upload only the selected view.",
        "download" : "Initiate a download of the full profile.",
      };
      for (var elemId in tooltip) {
        var elem = document.getElementById(elemId); 
        if (!elem)
          continue;
        if (elem.parentNode.nodeName.toLowerCase() == "label")
          elem = elem.parentNode;
        elem.title = tooltip[elemId];
      }
    },

    totalPower: function infoBar_totalPower() { // in Joules
      var data = gCurrentlyShownSampleData;
      var totalPower = 0.0;
      var lastTime = null;
      for (var i = 0; i < data.length; ++i) {
        if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["power"])
          continue;
        if (isNaN(data[i].extraInfo["time"])) {
          console.log("missing timestamp for power calculation");
          lastTime = null;
          continue;
        }
        if (lastTime == null) {
          lastTime = data[i].extraInfo['time'];
          continue;
        }
        var deltaTime = data[i].extraInfo['time'] - lastTime;
        totalPower += data[i].extraInfo["power"] * deltaTime / 1000;
      }
      return totalPower.toFixed(2);
    },

    peakPower: function infoBar_peakPower() {
      var data = gCurrentlyShownSampleData;
      var peakPower = 0.0;
      for (var i = 0; i < data.length; ++i) {
        if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["power"])
          continue;
        var deltaTime = null;
        if (isNaN(data[i].extraInfo["time"])) {
          console.log("missing timestamp for power calculation");
          lastTime = null;
          continue;
        }
        var power = data[i].extraInfo["power"];
        if (power > peakPower) {
          peakPower = power;
        }
      }
      return peakPower.toFixed(2);
    },

    totalPowerStr: function infoBar_totalPowerStr() {
      var power = this.totalPower();
      if (power > 1000000) {
        return (power / 1000000).toFixed(2) + " MJ";
      } else if (power > 1000) {
        return (power / 1000).toFixed(2) + " kJ";
      } else {
        return power + " J";
      }
    },

    avgResponsiveness: function infoBar_avgResponsiveness() {
      var data = gCurrentlyShownSampleData;
      var totalRes = 0.0;
      for (var i = 0; i < data.length; ++i) {
        if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["responsiveness"])
          continue;
        totalRes += data[i].extraInfo["responsiveness"];
      }
      return totalRes / this.numberOfCurrentlyShownSamples();
    },

    effectiveInterval: function infoBar_effectiveInterval() {
      var data = gCurrentlyShownSampleData;
      var interval = 0.0;
      var sampleCount = 0;
      var timeCount = 0;
      var lastTime = null;
      for (var i = 0; i < data.length; ++i) {
        if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["time"]) {
          lastTime = null;
          continue;
        }
        if (lastTime) {
          sampleCount++;
          timeCount += data[i].extraInfo["time"] - lastTime;
        }
        lastTime = data[i].extraInfo["time"];
      }
      var effectiveInterval = timeCount/sampleCount;
      // Biggest diff
      var biggestDiff = 0;
      lastTime = null;
      for (var i = 0; i < data.length; ++i) {
        if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["time"]) {
          lastTime = null;
          continue;
        }
        if (lastTime) {
          if (biggestDiff < Math.abs(effectiveInterval - (data[i].extraInfo["time"] - lastTime)))
            biggestDiff = Math.abs(effectiveInterval - (data[i].extraInfo["time"] - lastTime));
        }
        lastTime = data[i].extraInfo["time"];
      }

      if (effectiveInterval != effectiveInterval)
        return "Time info not collected";

      return (effectiveInterval).toFixed(2) + " ms ±" + biggestDiff.toFixed(2);
    },

    maxResponsiveness: function maxResponsiveness() {
      var data = gCurrentlyShownSampleData;
      var maxRes = 0.0;
      for (var i = 0; i < data.length; ++i) {
        if (!data[i] || !data[i].extraInfo || !data[i].extraInfo["responsiveness"])
          continue;
        if (maxRes < data[i].extraInfo["responsiveness"])
          maxRes = data[i].extraInfo["responsiveness"];
      }
      return maxRes;
    },

    numberOfCurrentlyShownSamples: function infoBar_numberOfCurrentlyShownSamples() {
      var data = gCurrentlyShownSampleData;
      var num = 0;
      for (var i = 0; i < data.length; ++i) {
        if (data[i])
          num++;
      }
      return num;
    },

    populate_skip_symbol: function infoBar_populate_skip_symbol() {
      var skipSymbolCtrl = document.getElementById('skipsymbol')
      //skipSymbolCtrl.options = gSkipSymbols;
      for (var i = 0; i < gSkipSymbols.length; i++) {
        var elOptNew = document.createElement('option');
        elOptNew.text = gSkipSymbols[i];
        elOptNew.value = gSkipSymbols[i];
        elSel.add(elOptNew);
      } 
    },

    delete_skip_symbol: function InfoBar_delete_skip_symbol() {
      var skipSymbol = document.getElementById('skipsymbol').value
    },

    add_skip_symbol: function InfoBar_add_skip_symbol() {
      
    }
  }

  window.InfoBar = InfoBar;
}(this));
