'use strict';

(function(window) {
  var EIDETICKER_BASE_URL = "http://eideticker.wrla.ch/";
  var Cleopatra = {
    init: function cleopatra_init() {
      AppUI.init();

      var queryData;
      if (location.hash) {
        queryData = new QueryData(location.hash.substring(1));
      } else {
        queryData = new QueryData();
      }

      if (queryData.videoCapture) {
        this.appendVideoCapture(queryData.videoCapture);
      }
      if (queryData.trace) {
        this.enableProfilerTracing();
      } else if (queryData.logging) {
        this.enableProfilerLogging();
      }

      this.loadQueryData(queryData);

      if (queryData.report) {
        if (queryData.report.length == 40) {
          this.loadProfileURL('https://profile-store.commondatastorage.googleapis.com/' + queryData.report);
        } else {
          this.loadProfileURL('https://profile-logs.appspot.com/serve/' + queryData.report);
        }
      } else if (queryData.customProfile !== undefined) {
        this.loadProfileURL(queryData.customProfile);
      } else if (queryData.usesample !== undefined) {
        var filename;
        if (filename == "pseudo") {
          filename = 'sample.profile';
        } else if (queryData.usesample !== null) {
          filename = queryData.usesample;
        } else {
          filename = "sample.big";
        }
        this.loadProfileURL(filename);
      } else if (queryData.zippedProfile) {
        // Fetch a compressed eideticker profile
        this.loadZippedProfileURL(queryData.zippedProfile, queryData.pathInZip);
      }

      window.addEventListener('message', this);
      window.addEventListener('prompt-upload-profile', this);
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
    },

    handleEvent: function Cleopatra_handleEvent(evt) {
      switch (evt.type) {
        case 'message':
          this._handleMessage(evt.data);
          break;
        case 'prompt-upload-profile':
          this.promptUploadProfile(evt.detail);
          break;
      }
    },

    _handleMessage: function Cleopatra__handleMessage(data) {
      // This is triggered by the profiler add-on.
      var o = JSON.parse(data);
      switch (o.task) {
        case "importFromAddonStart":
          var totalReporter = AppUI.enterProgressUI();
          gImportFromAddonSubreporters = totalReporter.addSubreporters({
            import: 10000,
            parsing: 1000
          });
          gImportFromAddonSubreporters.import.begin("Symbolicating...");
          break;
        case "importFromAddonProgress":
          gImportFromAddonSubreporters.import.setProgress(o.progress);
          if (o.action != null) {
              gImportFromAddonSubreporters.import.setAction(o.action);
          }
          break;
        case "importFromAddonFinish":
          this.importFromAddonFinish(o.rawProfile);
          break;
      }
    },

    promptUploadProfile: function Cleopatra_promptUploadProfile(selected) {
      var overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = 0;
      overlay.style.left = 0;
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.backgroundColor = "transparent";

      var bg = document.createElement("div");
      bg.style.position = "absolute";
      bg.style.top = 0;
      bg.style.left = 0;
      bg.style.width = "100%";
      bg.style.height = "100%";
      bg.style.opacity = "0.6";
      bg.style.backgroundColor = "#aaaaaa";
      overlay.appendChild(bg);

      var contentDiv = document.createElement("div");
      contentDiv.className = "sideBar";
      contentDiv.style.position = "absolute";
      contentDiv.style.top = "50%";
      contentDiv.style.left = "50%";
      contentDiv.style.width = "40em";
      contentDiv.style.height = "20em";
      contentDiv.style.marginLeft = "-20em";
      contentDiv.style.marginTop = "-10em";
      contentDiv.style.padding = "10px";
      contentDiv.style.border = "2px solid black";
      contentDiv.style.backgroundColor = "rgb(219, 223, 231)";
      overlay.appendChild(contentDiv);

      var noticeHTML = "";
      noticeHTML += "<center><h2 style='font-size: 2em'>Upload Profile - Privacy Notice</h2></center>";
      noticeHTML += "You're about to upload your profile publicly where anyone will be able to access it. ";
      noticeHTML += "To better diagnose performance problems profiles include the following information:";
      noticeHTML += "<ul>";
      noticeHTML += " <li>The <b>URLs</b> and scripts of the tabs that were executing.</li>";
      noticeHTML += " <li>The <b>metadata of all your Add-ons</b> to identify slow Add-ons.</li>";
      noticeHTML += " <li>Firefox build and runtime configuration.</li>";
      noticeHTML += "</ul><br>";
      noticeHTML += "To view all the information you can download the full profile to a file and open the json structure with a text editor.<br><br>";
      contentDiv.innerHTML = noticeHTML;

      var cancelButton = document.createElement("input");
      cancelButton.style.position = "absolute";
      cancelButton.style.bottom = "10px";
      cancelButton.type = "button";
      cancelButton.value = "Cancel";
      cancelButton.onclick = function() {
        document.body.removeChild(overlay);
      }
      contentDiv.appendChild(cancelButton);

      var uploadButton = document.createElement("input");
      uploadButton.style.position = "absolute";
      uploadButton.style.right = "10px";
      uploadButton.style.bottom = "10px";
      uploadButton.type = "button";
      uploadButton.value = "Upload";
      var self = this;
      uploadButton.onclick = function() {
        document.body.removeChild(overlay);
        self.uploadProfile(selected);
      }
      contentDiv.appendChild(uploadButton);

      document.body.appendChild(overlay);
    },

    uploadProfile: function Cleopatra_uploadProfile(selected) {
      Parser.getSerializedProfile(!selected, function (dataToUpload) {
        var dataSize;
        var sizeInBytes = dataToUpload.length;
        if (dataToUpload.length > 1024*1024) {
          dataSize = (dataToUpload.length/1024/1024).toFixed(1) + " MB(s)";
        } else {
          dataSize = (dataToUpload.length/1024).toFixed(1) + " KB(s)";
        }

        function getErrorMessage(status) {
          var msg = "Error " + status + " occurred uploading your file.";
          if (sizeInBytes > 9 * 1024 * 1024) {
            msg += " The profile that you are trying to upload is more then the 9 MBs storage maximum. For more information see <a href='https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Profiling_with_the_Built-in_Profiler#Profile_Fails_to_Upload'>how to host your profile.</a>";
          }
          return msg;
        }

        var oXHR = new XMLHttpRequest();
        oXHR.onload = function (oEvent) {
          if (oXHR.status == 200) {  
            gReportID = oXHR.responseText;
            AppUI.updateDocumentURL();
            document.getElementById("upload_status").innerHTML = "Success! Use this <a id='linkElem'>link</a>";
            document.getElementById("linkElem").href = document.URL;
          } else {  
            document.getElementById("upload_status").innerHTML = getErrorMessage(oXHR.status);
          }  
        };
        oXHR.onerror = function (oEvent) {
          document.getElementById("upload_status").innerHTML = getErrorMessage(oXHR.status);
        }
        oXHR.upload.onprogress = function(oEvent) {
          if (oEvent.lengthComputable) {
            var progress = Math.round((oEvent.loaded / oEvent.total)*100);
            if (progress == 100) {
              document.getElementById("upload_status").innerHTML = "Uploading: Waiting for server side compression";
            } else {
              document.getElementById("upload_status").innerHTML = "Uploading: " + Math.round((oEvent.loaded / oEvent.total)*100) + "%";
            }
          }
        };

        var formData = new FormData();
        formData.append("file", dataToUpload);
        document.getElementById("upload_status").innerHTML = "Uploading Profile (" + dataSize + ")";
        oXHR.open("POST", "https://profile-store.appspot.com/store", true);
        oXHR.send(formData);
      });
    },

    unQueryEscape: function Cleopatra_unQueryEscape(str) {
      return decodeURIComponent(str);
    },

    queryEscape: function Cleopatra_queryEscape(str) {
      return "BEN: " + encodeURIComponent(str);
    },

    loadQueryData: function Cleopatra_loadQueryData(queryData) {
      var isFiltersChanged = false;
      var queryDataOriginal = queryData;
      var queryData = {};
      for (var i in queryDataOriginal) {
        queryData[i] = this.unQueryEscape(queryDataOriginal[i]);
      }
      if (queryData.search) {
        gQueryParamFilterName = queryData.search;
        isFiltersChanged = true;
      }
      if (queryData.jankOnly) {
        gJankOnly = queryData.jankOnly;
        isFiltersChanged = true;
      }
      if (queryData.javascriptOnly) {
        gJavascriptOnly = queryData.javascriptOnly;
        isFiltersChanged = true;
      }
      if (queryData.mergeUnbranched) {
        gMergeUnbranched = queryData.mergeUnbranched;
        isFiltersChanged = true;
      }
      if (queryData.invertCallback) {
        gInvertCallstack = queryData.invertCallback;
        isFiltersChanged = true;
      }
      if (queryData.report) {
        gReportID = queryData.report;
      }
      if (queryData.filter) {
        var filterChain = JSON.parse(queryData.filter);
        gSampleFilters = filterChain;
      }
      if (queryData.select) {
        var parts = queryData.select.split(',');
        if (parts.length == 2) {
          var start = parts[0];
          var end = parts[1];
          gSampleFilters.push({
            type:"RangeSampleFilter",
            start:parseInt(start),
            end:parseInt(end)
          });
        }
      }
      if (queryData.selection) {
        var selection = queryData.selection;
        gRestoreSelection = selection;
      }

      if (isFiltersChanged) {
        //window.dispatchEvent(new CustomEvent('filters-changed'));
      }
    },

    importFromAddonFinish:function Cleopatra_importFromAddonFinish(rawProfile) {
      gImportFromAddonSubreporters.import.finish();
      this.loadRawProfile(gImportFromAddonSubreporters.parsing, rawProfile);
    },

    enableProfilerLogging: function Cleopatra_enableProfilerLogging() {
      gDebugLog = true;
      Parser.updateLogSetting();
    },

    enableProfilerTracing: function Cleopatra_enableProfilerTracing() {
      gDebugLog = true;
      gDebugTrace = true;
      Parser.updateLogSetting();
    },

    loadProfileFile: function Cleopatra_loadProfileFile(fileList) {
      if (fileList.length == 0)
        return;
      var file = fileList[0];
      var reporter = AppUI.enterProgressUI();
      var subreporters = reporter.addSubreporters({
        fileLoading: 1000,
        parsing: 1000
      });

      var reader = new FileReader();
      var self = this;
      reader.onloadend = function () {
        subreporters.fileLoading.finish();
        self.loadRawProfile(subreporters.parsing, reader.result);
      };
      reader.onprogress = function (e) {
        subreporters.fileLoading.setProgress(e.loaded / e.total);
      };
      reader.readAsText(file, "utf-8");
      subreporters.fileLoading.begin("Reading local file...");
    },

    loadLocalStorageProfile: function Cleopatra_loadLocalStorageProfile(profileKey) {
      var reporter = AppUI.enterProgressUI();
      var subreporters = reporter.addSubreporters({
        fileLoading: 1000,
        parsing: 1000
      });

      var self = this;
      gLocalStorage.getProfile(profileKey, function(profile) {
        subreporters.fileLoading.finish();
        self.loadRawProfile(subreporters.parsing, profile, profileKey);
      });
      subreporters.fileLoading.begin("Reading local storage...");
    },

    appendVideoCapture: function Cleopatra_appendVideoCapture(videoCapture) {
      if (videoCapture.indexOf("://") == -1) {
        videoCapture = EIDETICKER_BASE_URL + videoCapture;
      }
      gAppendVideoCapture = videoCapture;
    },

    loadXHRWithProgress: function Cleopatra_loadXHRWithProgress(url, responseType, onsuccess, onerror, progressReporter) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = responseType;
      var self = this;
      xhr.onreadystatechange = function (e) {
        if (xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0)) {
          progressReporter.finish();
          if (!xhr.response) {
            progressReporter.begin("File '" + url + "' is empty. Did you set the CORS headers?");
            onerror();
            return;
          }
          onsuccess(xhr);
        }
      };
      xhr.onerror = function (e) {
        progressReporter.begin("Error fetching file. URL: '" + url + "'. Did you set the CORS headers?");
        onerror(e);
      }
      xhr.onprogress = function (e) {
        if (e.lengthComputable && (e.loaded <= e.total)) {
          progressReporter.setProgress(e.loaded / e.total);
        } else {
          progressReporter.setProgress(NaN);
        }
      };
      try {
        xhr.send(null);
      } catch (e) {
        progressReporter.begin("Error fetching file. URL: '" + url + "':" + e.message);
        onerror(e);
      }
    },

    loadZippedProfileURL: function Cleopatra_loadZippedProfileURL(url, pathInZip) {
      var reporter = AppUI.enterProgressUI();
      var subreporters = reporter.addSubreporters({
        fileLoading: 4000,
        zipReading: 10,
        entryLoading: 2000
      });

      // Crude way to detect if we're using a relative URL or not :(
      if (url.indexOf("://") == -1) {
        url = EIDETICKER_BASE_URL + url;
      }
      PROFILERTRACE("Fetch url: " + url);

      function onerror(e) {
        PROFILERERROR("zip.js error");
        PROFILERERROR(JSON.stringify(e));
      }

      var self = this;
      function onsuccess(xhr) {
        subreporters.zipReading.begin("Reading zip file entries...");
        zip.workerScriptsPath = "js/zip.js/";
        zip.createReader(new zip.BlobReader(xhr.response), function(zipReader) {
          subreporters.zipReading.finish();
          zipReader.getEntries(function(entries) {
            if (entries.length == 0) {
              subreporters.zipReader.begin("There are no files contained in this zip.");
              return;
            }
            if (!pathInZip && entries.length == 1) {
              pathInZip = entries[0].filename;
            }
            if (pathInZip) {
              var entry = entries.filter(function (entry) { return entry.filename == pathInZip; })[0];
              if (!entry) {
                onerror(pathInZip + " not found in zip file.");
              }
              self.loadProfileZipEntry(entry, subreporters.entryLoading);
            } else {
              AppUI.showChooserPanel("Please choose one of the files contained in this zip for opening.",
                entries.map(function (entry) {
                  return {
                    label: entry.filename,
                    href: './?zippedProfile=' + url + '&pathInZip=' + entry.filename,
                    obj: entry
                  };
                }),
                function (chosenObj) {
                  var entry = chosenObj.obj;
                  if (window.history && window.history.replaceState) {
                    history.pushState({}, document.title, chosenObj.href);
                  }
                  self.loadProfileZipEntry(entry, subreporters.entryLoading);
                }
              );
            }
          });
        });
      }

      this.loadXHRWithProgress(url, "blob", onsuccess, onerror, subreporters.fileLoading);
    },

    loadProfileZipEntry: function Cleopatra_loadProfileZipEntry(entry, reporter) {
      var subreporters = reporter.addSubreporters({
        unzipping: 1000,
        parsing: 2000
      });
      var self = this;
      subreporters.unzipping.begin("Decompressing " + entry.filename);
      entry.getData(new zip.TextWriter(), function(profileText) {
        subreporters.unzipping.finish();
        self.loadRawProfile(subreporters.parsing, profileText);
      });
    },

    loadProfileURL: function Cleopatra_loadProfileURL(url) {
      var reporter = AppUI.enterProgressUI();
      var subreporters = reporter.addSubreporters({
        fileLoading: 1000,
        parsing: 1000
      });

      var self = this;
      function onsuccess(xhr) {
        PROFILERLOG("Got profile from '" + url + "'.");
        if (xhr.responseText == null || xhr.responseText === "") {
          subreporters.fileLoading.begin("Profile '" + url + "' is empty. Did you set the CORS headers?");
          return;
        }
        self.loadRawProfile(subreporters.parsing, xhr.responseText, url);
      }
      function onerror(e) { 
        subreporters.fileLoading.begin("Error fetching profile :(. URL: '" + url + "'. Did you set the CORS headers?");
      }

      this.loadXHRWithProgress(url, "text", onsuccess, onerror, subreporters.fileLoading);
    },

    loadProfile: function Cleopatra_loadProfile(rawProfile) {
      if (!rawProfile)
        return;
      var reporter = AppUI.enterProgressUI();
      this.loadRawProfile(reporter, rawProfile);
    },

    loadRawProfile: function Cleopatra_loadRawProfile(reporter, rawProfile, profileId) {
      PROFILERLOG("Parse raw profile: ~" + rawProfile.length + " bytes");
      reporter.begin("Parsing...");
      if (rawProfile == null || rawProfile.length === 0) {
        reporter.begin("Profile is null or empty");
        return;
      }
      var startTime = Date.now();
      var parseRequest = Parser.parse(rawProfile, {
        appendVideoCapture : gAppendVideoCapture,  
        profileId: profileId,
      });
      gVideoCapture = null;
      parseRequest.addEventListener("progress", function (progress, action) {
        if (action)
          reporter.setAction(action);
        reporter.setProgress(progress);
      });
      parseRequest.addEventListener("finished", function (result) {
        console.log("parsing (in worker): " + (Date.now() - startTime) + "ms");
        reporter.finish();
        gMeta = result.meta;
        gTaskTracer = result.tasktracer;
        gNumSamples = result.numSamples;
        gSymbols = result.symbols;
        gFunctions = result.functions;
        gResources = result.resources;
        gThreadsDesc = result.threadsDesc;
        /**
         * @todo Decouple AppUI
         */
        AppUI.enterFinishedProfileUI();
        gFileList.profileParsingFinished();
      });
    }
  };

  window.Cleopatra = Cleopatra;
  Cleopatra.init();
}(this));
