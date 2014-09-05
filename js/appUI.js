'use strict';

(function(window) {
  var AppUI = {
    init: function AppUI_init() {
      var uiContainer = document.createElement("div");
      uiContainer.id = "ui";

      gFileList = new FileList();
      uiContainer.appendChild(gFileList.getContainer());

      //gFileList.addFile();
      gFileList.loadProfileListFromLocalStorage();

      gInfoBar = new InfoBar();
      uiContainer.appendChild(gInfoBar.getContainer());

      gMainArea = document.createElement("div");
      gMainArea.id = "mainarea";
      uiContainer.appendChild(gMainArea);
      document.body.appendChild(uiContainer);

      var profileEntryPane = document.createElement("div");
      profileEntryPane.className = "profileEntryPane";
      profileEntryPane.innerHTML = '' +
        '<h1>Upload your profile here:</h1>' +
        '<input type="file" id="datafile">' +
        '<h1>Or, alternatively, enter your profile data here:</h1>' +
        '<textarea rows=20 cols=80 id=data autofocus spellcheck=false></textarea>' +
        '<p><button id="parse">Parse</button></p>' +
        '<h1>Or, provide a URL serving the profile that has <a href="https://developer.mozilla.org/en-US/docs/HTTP/Access_control_CORS">CORS headers</a>:</h1>' +
        '<input type="text" id="url-value">' +
        '<input value="Open" type="button" id="url">' +
        '';

      gMainArea.appendChild(profileEntryPane);
      document.getElementById('parse').addEventListener('click', this);
      document.getElementById('datafile').addEventListener('change', this);
      document.getElementById('url').addEventListener('click', this);
      window.addEventListener('filters-changed', this.filtersChanged.bind(this));
      window.addEventListener('focus-on-callstack', this.focusOnCallstack.bind(this));
    },

    handleEvent: function AppUI_handleEvent(evt) {
      switch (evt.target.id) {
        case 'datafile':
          this.loadProfileFile(document.getElementById('datafile').files);
          break;

        case 'parse':
          this.loadProfile(document.getElementById('data').value);
          break;

        case 'url':
          this.loadProfileURL(document.getElementById('url-value').value);
          break;
      }
    },

    videoPaneTimeChange: function videoPaneTimeChange(video) {
      //if (!gMeta || !gMeta.frameStart)
      //  return;

      //var frame = gVideoPane.getCurrentFrameNumber();
      var time = gVideoPane.getApproxTime();
      //var frameStart = gMeta.frameStart[frame];
      //var frameEnd = gMeta.frameStart[frame+1]; // If we don't have a frameEnd assume the end of the profile
      //window.gHistogramContainer.showVideoFramePosition(frame, gMeta.frameStart[frame], gMeta.frameStart[(frame+1)%256]);

      window.gHistogramContainer.showVideoFramePosition("Video position", time, time + 15);
    },

    loadProfile: function AppUI_loadProfile(rawProfile) {
      if (!rawProfile)
        return;
      var reporter = this.enterProgressUI();
      Cleopatra.loadRawProfile(reporter, rawProfile);
    },

    loadProfileFile: function AppUI_loadProfileFile(fileList) {
      if (fileList.length == 0)
        return;
      var file = fileList[0];
      var reporter = this.enterProgressUI();
      var subreporters = reporter.addSubreporters({
        fileLoading: 1000,
        parsing: 1000
      });

      var reader = new FileReader();
      var self = this;
      reader.onloadend = function () {
        subreporters.fileLoading.finish();
        Cleopatra.loadRawProfile(subreporters.parsing, reader.result);
      };
      reader.onprogress = function (e) {
        subreporters.fileLoading.setProgress(e.loaded / e.total);
      };
      reader.readAsText(file, "utf-8");
      subreporters.fileLoading.begin("Reading local file...");
    },

    loadProfileURL: function AppUI_loadProfileURL(url) {
      if (!url)
        return;
      Cleopatra.loadProfileURL(url);
    },

    saveProfileToLocalStorage: function AppUI_saveProfileToLocalStorage() {
      Parser.getSerializedProfile(true, function (serializedProfile) {
        gLocalStorage.storeLocalProfile(serializedProfile, gMeta.profileId, function profileSaved() {

        });
      });
    },

    enterFinishedProfileUI: function AppUI_enterFinishedProfileUI() {
      this.saveProfileToLocalStorage();

      var finishedProfilePaneBackgroundCover = document.createElement("div");
      finishedProfilePaneBackgroundCover.className = "finishedProfilePaneBackgroundCover";

      var finishedProfilePane = document.createElement("div");
      var currRow;
      finishedProfilePane.className = "finishedProfilePane";
      var self = this;
      setTimeout(function() {
        // Work around a webkit bug. For some reason the table doesn't show up
        // until some actions happen such as focusing this box
        var filterNameInput = document.getElementById("filterName");
        if (filterNameInput != null) {
          self.changeFocus(filterNameInput);
         }
      }, 100);

      gBreadcrumbTrail = new BreadcrumbTrail();
      currRow = document.createElement("div");
      finishedProfilePane.appendChild(currRow);
      currRow.appendChild(gBreadcrumbTrail.getContainer());

      gHistogramContainer = new HistogramContainer();
      gHistogramContainer.updateThreads(gThreadsDesc);
      gHistogramContainer.onMarkerClick(function(threadMarker, selectedMarker) {
        gTabWidget.selectTab("Markers");
        gMarkerTreeManager.show();
        gMarkerTreeManager.display(threadMarker);
        if (selectedMarker) {
          gMarkerTreeManager.selectMarker(selectedMarker);
        }
      });
      currRow = document.createElement("div");
      finishedProfilePane.appendChild(currRow);
      currRow.appendChild(gHistogramContainer.container);
      gHistogramContainer.container.parentNode.className = "histogramContainerParent";

      if (false && gLocation.indexOf("file:") == 0) {
        // Local testing for frameView
        gFrameView = new FrameView();
        currRow = document.createElement("div");
        finishedProfilePane.appendChild(currRow);
        currRow.appendChild(gFrameView.getContainer());
      }

      // For testing:
      //gMeta.videoCapture = {
      //  src: "http://people.mozilla.org/~bgirard/test.ogv",
      //};

      if (gMeta && gMeta.videoCapture) {
        gVideoPane = new VideoPane(gMeta.videoCapture, gMeta.frameStart);
        gVideoPane.onTimeChange(AppUI.videoPaneTimeChange);
        currRow = document.createElement("div");
        finishedProfilePane.appendChild(currRow);
        currRow.appendChild(gVideoPane.getContainer());
      }

      var treeContainerDiv = document.createElement("div");
      treeContainerDiv.className = "treeContainer";
      treeContainerDiv.style.width = "100%";
      treeContainerDiv.style.height = "100%";

      gTabWidget = new TabWidget();
      gTabWidget.addTab("Samples", treeContainerDiv);

      currRow = document.createElement("div");
      currRow.style.flex = 1;
      currRow.style.height = "100%";
      currRow.appendChild(gTabWidget.getContainer());
      finishedProfilePane.appendChild(currRow);

      gTreeManager = new ProfileTreeManager();
      treeContainerDiv.appendChild(gTreeManager.getContainer());

      gSampleBar = new SampleBar();
      treeContainerDiv.appendChild(gSampleBar.getContainer());

      gGeckoLogHandler = new GeckoLogHandler();
      gTabWidget.addTab("Logging", gGeckoLogHandler.getContainer());

      // sampleBar

      gPluginView = new PluginView();
      //currRow = finishedProfilePane.insertRow(4);
      treeContainerDiv.appendChild(gPluginView.getContainer());

      gMarkerTreeManager = new MarkerTreeManager();
      gMarkerTreeManager.getContainer().style.padding = "0px";
      gTabWidget.addTab("Markers", gMarkerTreeManager.getContainer());
      this.MakeSizeAdjustable(gMarkerTreeManager.getTreeHeader(), gHistogramContainer.container.parentNode);

      tab_showInstruction("DisplayList", "To view display list dump you must: (1) Be running with OMTC enabled, (2) have the preference layout.display-list.dump;true set, (3) be running a debug or a 'ac_add_options --enable-dump-painting' build, (4) be sampling the main thread and the compositor thread.");
      tab_showInstruction("LayerTree", "To view layers tree you must: (1) Be running with OMTC enabled, (2) have the preference layers.dump;true set, (3) be sampling the main thread and the compositor thread.");

      gMainArea.appendChild(finishedProfilePaneBackgroundCover);
      gMainArea.appendChild(finishedProfilePane);

      var currentBreadcrumb = gSampleFilters;
      var self = this;
      gBreadcrumbTrail.add({
        title: "Complete Profile",
        enterCallback: function () {
          gSampleFilters = [];
          self.filtersChanged();
        }
      });
      if (currentBreadcrumb == null || currentBreadcrumb.length == 0) {
        gTreeManager.restoreSerializedSelectionSnapshot(gRestoreSelection);
        this.viewOptionsChanged();
      }
      for (var i = 0; i < currentBreadcrumb.length; i++) {
        var filter = currentBreadcrumb[i];
        var forceSelection = null;
        if (gRestoreSelection != null && i == currentBreadcrumb.length - 1) {
          forceSelection = gRestoreSelection;
        }
        switch (filter.type) {
          case "FocusedFrameSampleFilter":
            this.focusOnSymbol(filter.name, filter.symbolName);
            gBreadcrumbTrail.enterLastItem(forceSelection);
          case "FocusedCallstackPrefixSampleFilter":
            this.focusOnCallstack(filter.focusedCallstack, filter.name, false);
            gBreadcrumbTrail.enterLastItem(forceSelection);
          case "FocusedCallstackPostfixSampleFilter":
            this.focusOnCallstack(filter.focusedCallstack, filter.name, true);
            gBreadcrumbTrail.enterLastItem(forceSelection);
          case "RangeSampleFilter":
            gHistogramContainer.selectRange(filter.start, filter.end);
            gBreadcrumbTrail.enterLastItem(forceSelection);
        }
      }
    },
    MakeSizeAdjustable: function AppUI_MakeSizeAdjustable(dragElement, elementToResize) {
      var startY = 32;
      var h = 16;
      dragElement.classList.add("adjustable");
      dragElement.addEventListener("mousedown", function(e) {
        dragElement.dragging = function(e) {
          var mh = e.clientY;
          elementToResize.style.maxHeight = Math.max(60, (mh - h/2 - startY)) + "px";
          console.log((h) + "px");
        };
        document.addEventListener("mousemove", dragElement.dragging);
        dragElement.dragging(e);
      });
      document.addEventListener("mouseup", function() {
        document.removeEventListener("mousemove", dragElement.dragging);
      });
    },
    enterProgressUI: function AppUI_enterProgressUI() {
      var profileProgressPane = document.createElement("div");
      profileProgressPane.className = "profileProgressPane";

      var progressLabel = document.createElement("a");
      profileProgressPane.appendChild(progressLabel);

      var progressBar = document.createElement("progress");
      profileProgressPane.appendChild(progressBar);

      var totalProgressReporter = new ProgressReporter();
      totalProgressReporter.addListener(function (r) {
        var progress = r.getProgress();
        progressLabel.innerHTML = r.getAction();
        //console.log("Action: " + r.getAction());
        if (isNaN(progress))
          progressBar.removeAttribute("value");
        else
          progressBar.value = progress;
      });

      gMainArea.appendChild(profileProgressPane);

      Parser.updateLogSetting();

      return totalProgressReporter;
    },
    filtersChanged: function AppUI_filtersChanged(evt) {
      var boundaries = evt ? evt.detail : null;
      this.updateDocumentURL();
      var data = { symbols: {}, functions: {}, samples: [] };

      gHistogramContainer.dataIsOutdated();
      var filterNameInput = document.getElementById("filterName");
      for (var threadId in gThreadsDesc) {
        var updateRequest = Parser.updateFilters({
          mergeFunctions: gMergeFunctions,
          nameFilter: (filterNameInput && filterNameInput.value) || gQueryParamFilterName || "",
          sampleFilters: gSampleFilters,
          jankOnly: gJankOnly,
          javascriptOnly: gJavascriptOnly
        }, threadId);
      }

      var start = Date.now();
      updateRequest.addEventListener("finished", function (filteredSamples) {
        console.log("profile filtering (in worker): " + (Date.now() - start) + "ms.");
        gCurrentlyShownSampleData = filteredSamples;
        gInfoBar.display();

        if (gSampleFilters.length > 0 && gSampleFilters[gSampleFilters.length-1].type === "PluginView") {
          start = Date.now();
          gPluginView.display(gSampleFilters[gSampleFilters.length-1].pluginName, gSampleFilters[gSampleFilters.length-1].param,
                              gCurrentlyShownSampleData, gHighlightedCallstack);
          console.log("plugin displaying: " + (Date.now() - start) + "ms.");
        } else {
          gPluginView.hide();
        }
      });

      var self = this;
      function onBoundariesFinished(data) {
        var options = {
          showPowerInfo: gShowPowerInfo,
          peakPower: gPeakPower,
          sampleMin: data.minima,
          sampleMax: data.maxima
        };

        var boundaries = {
          min: data.minima,
          max: data.maxima
        };

        for (var threadId in gThreadsDesc) {
          var histogramRequest = Parser.calculateHistogramData(gShowMissedSample, options, threadId);
          histogramRequest.addEventListener("finished", function (data) {
            start = Date.now();
            gHistogramContainer.display(data.threadId, data.histogramData, data.frameStart, data.widthSum, gHighlightedCallstack, boundaries, gInvertCallstack, data.markers);
            if (gFrameView)
              gFrameView.display(data.histogramData, data.frameStart, data.widthSum, gHighlightedCallstack,
                boundaries);
            //console.log("histogram displaying: " + (Date.now() - start) + "ms.");
          });
        }

        if (gVideoPane) {
          gVideoPane.setBoundaries(boundaries);
        }

        var waterfallRequest = Parser.calculateWaterfallData(boundaries);
        waterfallRequest.addEventListener("finished", function (data) {
          if (!data) {
            return;
          }
          gHistogramContainer.displayWaterfall(data);

          if (data.compositeTimes && data.compositeTimes.length > 2) {
            gTabWidget.addTab("Frames", function() {
              var frameUniformityView = Waterfall.createFrameUniformityView(data.compositeTimes);
              return frameUniformityView;
            });
            gTabWidget.addTab("Uniformity", function() {
              return Waterfall.createFramePositionView(data.framePositions);
            });
          }
        });
        var logDataRequest = Parser.getLogData(boundaries);
        logDataRequest.addEventListener("finished", function (data) {
          gGeckoLogHandler.setLogData(data);
        });

        self.diagnosticChanged();
        self.viewOptionsChanged();
      }

      if (boundaries)
        return void onBoundariesFinished({ minima: boundaries.start, maxima: boundaries.end });

      var boundariesRequest = Parser.getHistogramBoundaries(gShowMissedSample);
      boundariesRequest.addEventListener("finished", onBoundariesFinished);
    },

    focusOnCallstack: function AppUI_focusOnCallstack(focusedCallstack, name, overwriteCallstack) {
      var invertCallback =  gInvertCallstack;
      if (overwriteCallstack != null) {
        invertCallstack = overwriteCallstack;
      }
      var filter = {
        type: !invertCallstack ? "FocusedCallstackPostfixSampleFilter" : "FocusedCallstackPrefixSampleFilter",
        name: name,
        focusedCallstack: focusedCallstack,
        appliesToJS: gJavascriptOnly
      };
      var self = this;
      var newFilterChain = gSampleFilters.concat([filter]);
      gBreadcrumbTrail.addAndEnter({
        title: name,
        enterCallback: function () {
          gSampleFilters = newFilterChain;
          self.filtersChanged();
        }
      })
    },

    focusOnSymbol: function AppUI_focusOnSymbol(focusSymbol, name) {
      var newFilterChain = gSampleFilters.concat([{type: "FocusedFrameSampleFilter", name: name, focusedSymbol: focusSymbol}]);
      gBreadcrumbTrail.addAndEnter({
        title: name,
        enterCallback: function () {
          gSampleFilters = newFilterChain;
          window.dispatchEvent(new CustomEvent('filters-changed'));
        }
      });
    },

    setHighlightedCallstack: function AppUI_setHighlightedCallstack(samples, heaviestSample) {
      // Make sure that the right tree is shown
      //gTabWidget.selectTab("Samples");

      gHighlightedCallstack = samples;
      gHistogramContainer.highlightedCallstackChanged(gHighlightedCallstack, gInvertCallstack);
      if (!gInvertCallstack) {
        // Always show heavy
        heaviestSample = heaviestSample.clone().reverse();
      }
      gSampleBar.setSample(heaviestSample);
    },

    // Make all focus change events go through this function.
    // This function will mediate the focus changes in case
    // that we're in a compare view. In a compare view an inactive
    // instance of cleopatra should not steal focus from the active
    // cleopatra instance.
    changeFocus: function AppUI_changeFocus(elem) {
      if (window.comparator_changeFocus) {
        window.comparator_changeFocus(elem);
      } else {
        elem.focus();
      }
    },

    filterUpdate: function AppUI_filterUpdate() {
      gFilterChangeCallback = null;

      this.filtersChanged();

      var filterNameInput = document.getElementById("filterName");
      if (filterNameInput != null) {
        this.changeFocus(filterNameInput);
      }
    },

    changeWorseResponsiveness: function AppUI_changeWorseResponsiveness(res) {
      Parser.changeWorseResponsiveness(res);
      this.filterUpdate();
    },

    filterOnChange: function filterOnChange() {
      if (gFilterChangeCallback != null) {
        clearTimeout(gFilterChangeCallback);
        gFilterChangeCallback = null;
      }

      gFilterChangeCallback = setTimeout(this.filterUpdate.bind(this), gFilterChangeDelay);
    },

    queryEscape: function AppUI_queryEscape(str) {
      return encodeURIComponent(encodeURIComponent(str));
    },

    updateDocumentURL: function AppUI_updateDocumentURL() {
      location.hash = this.getDocumentHashString();
      return document.location;
    },

    getDocumentHashString: function AppUI_getDocumentHashString() {
      var query = "";
      if (gReportID) {
        if (query != "")
          query += "&";
        query += "report=" + this.queryEscape(gReportID);
      }
      if (document.getElementById("filterName") != null &&
          document.getElementById("filterName").value != null &&
          document.getElementById("filterName").value != "") {
        if (query != "")
          query += "&";
        query += "search=" + this.queryEscape(document.getElementById("filterName").value);
      }
      // For now don't restore the view rest
      return query;
      if (gJankOnly) {
        if (query != "")
          query += "&";
        query += "jankOnly=" + this.queryEscape(gJankOnly);
      }
      if (gJavascriptOnly) {
        if (query != "")
          query += "&";
        query += "javascriptOnly=" + this.queryEscape(gJavascriptOnly);
      }
      if (gMergeUnbranched) {
        if (query != "")
          query += "&";
        query += "mergeUnbranched=" + this.queryEscape(gMergeUnbranched);
      }
      if (gInvertCallstack) {
        if (query != "")
          query += "&";
        query += "invertCallback=" + this.queryEscape(gInvertCallstack);
      }
      if (gSampleFilters && gSampleFilters.length != 0) {
        if (query != "")
          query += "&";
        query += "filter=" + this.queryEscape(JSON.stringify(gSampleFilters));
      }
      if (gTreeManager.hasNonTrivialSelection()) {
        if (query != "")
          query += "&";
        query += "selection=" + this.queryEscape(gTreeManager.serializeCurrentSelectionSnapshot());
      }
      if (!gReportID) {
        query = "uploadProfileFirst!";
      }

      return query;
    },

    diagnosticChanged: function AppUI_diagnosticChanged() {
      var diagnosticsRequest = Parser.calculateDiagnosticItems(gMeta, gSelectedThreadId);
      var diagnosticThreadId = gSelectedThreadId;
      diagnosticsRequest.addEventListener("finished", function (diagnosticItems) {
        var start = Date.now();
        gHistogramContainer.displayDiagnostics(diagnosticItems, diagnosticThreadId);
        console.log("diagnostic items displaying: " + (Date.now() - start) + "ms.");
      }, diagnosticThreadId);
    },

    viewOptionsChanged: function AppUI_viewOptionsChanged(finished_cb) {
      gTreeManager.dataIsOutdated();
      var filterNameInput = document.getElementById("filterName");
      var updateViewOptionsRequest = Parser.updateViewOptions({
        invertCallstack: gInvertCallstack,
        mergeUnbranched: gMergeUnbranched
      }, gSelectedThreadId);
      updateViewOptionsRequest.addEventListener("finished", function (calltree) {
        var start = Date.now();
        gHistogramContainer.invertionChanged(gInvertCallstack);
        gTreeManager.display(calltree, gSymbols, gFunctions, gResources, gMergeFunctions, filterNameInput && filterNameInput.value);
        console.log("tree displaying: " + (Date.now() - start) + "ms.");
        if (finished_cb) {
          finished_cb();
        }
      });
    }
  };
  window.AppUI = AppUI;
}(this));
