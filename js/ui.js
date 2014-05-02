'use strict';

(function(window) {
  function initGlobalVars() {
    window.gDebugLog = false;
    window.gDebugTrace = false;
    window.gLocation = window.location + "";
    if (gLocation.indexOf("file:") == 0) {
      gDebugLog = true;
      gDebugTrace = true;
      PROFILERLOG("Turning on logging+tracing since cleopatra is served from the file protocol");
    }
    window.gFilterChangeCallback = null;
    window.gFilterChangeDelay = 1200;

    window.gNumSamples = 0;
    window.gMeta = null;
    window.gSymbols = {};
    window.gFunctions = {};
    window.gResources = {};
    window.gThreadsDesc = {};
    window.gSelectedThreadId = 0;
    window.gHighlightedCallstack = [];
    window.gFrameView = null;
    window.gTreeManager = null;
    window.gMarkerTreeManager = null;
    window.gSampleBar = null;
    window.gBreadcrumbTrail = null;
    window.gHistogramContainer = null;
    window.gVideoPane = null;
    window.gPluginView = null;
    window.gFileList = null;
    window.gInfoBar = null;
    window.gMainArea = null;
    window.gHighlighMovingStack = false;
    window.gCurrentlyShownSampleData = null;
    window.gSkipSymbols = ["test2", "test1"];
    window.gAppendVideoCapture = null;
    window.gQueryParamFilterName = null;
    window.gRestoreSelection = null;
    window.gVideoCapture = null;
    window.gReportID = null;
    window.gTabWidget = null;
    window.gGeckoLogHandler = null;

    window.gImportFromAddonSubreporters = null;

    window.gShowFrames = false;

    window.gInvertCallstack = false;

    window.gMergeUnbranched = false;

    window.gMergeFunctions = true;

    window.gJankOnly = false;
    window.gJankThreshold = 50 /* ms */;

    window.gShowMissedSample = false;

    window.gShowPowerInfo = false;
    window.gPeakPower = 30; // Watts

    window.gJavascriptOnly = false;

    window.gSampleFilters = [];
  };

  // Use for verbose tracing, otherwise use log
  window.PROFILERTRACE = function PROFILERTRACE(msg) {
    if (gDebugTrace)
      PROFILERLOG(msg);
  };

  window.PROFILERLOG = function PROFILERLOG(msg) {
    if (gDebugLog) {
      msg = "Cleo: " + msg;
      console.log(msg);
      if (window.dump)
        window.dump(msg + "\n");
    }
  };

  window.PROFILERERROR = function PROFILERERROR(msg) {
    msg = "Cleo: " + msg;
    console.log(msg);
    if (window.dump)
      window.dump(msg + "\n");
  };

  window.removeAllChildren = function removeAllChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  };

  /**
   * Dead code
   */
  window.copyProfile = function copyProfile() {
    window.prompt ("Copy to clipboard: Ctrl+C, Enter", document.getElementById("data").value);
  };

  /**
   * Dead code
   */
  window.api_toggleMovingStack = function api_toggleMovingStack() {
    gHighlighMovingStack = !gHighlighMovingStack;
    window.dispatchEvent(new CustomEvent('filters-changed'));
  };

  window.getTextData = function getTextData() {
    window.data = [];
    window.samples = gCurrentlyShownSampleData;
    for (window.i = 0; i < samples.length; i++) {
      data.push(samples[i].lines.join("\n"));
    }
    return data.join("\n");
  }

  window.comparator_receiveSelection = function comparator_receiveSelection(snapshot, frameData) {
    gTreeManager.restoreSerializedSelectionSnapshot(snapshot); 
    if (frameData)
      gTreeManager.highlightFrame(frameData);
    AppUI.viewOptionsChanged();
  };

  initGlobalVars();
}(this));
