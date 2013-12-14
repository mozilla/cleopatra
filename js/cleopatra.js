'use strict';

(function(window) {
  var Cleopatra = {
    init: function cleopatra_init() {
      window.enterMainUI();

      var queryData;
      if (window.location.hash) {
        queryData = new QueryData(window.location.hash.substring(1));
      } else {
        queryData = new QueryData();
      }

      if (queryData.videoCapture) {
        window.appendVideoCapture(queryData.videoCapture);
      }
      if (queryData.trace) {
        window.enableProfilerTracing();
      } else if (queryData.logging) {
        window.enableProfilerLogging();
      }

      if (queryData.report) {
        if (queryData.report.length == 40) {
          window.loadProfileURL('http://profile-store.commondatastorage.googleapis.com/' + queryData.report);
        } else {
          window.loadProfileURL('http://profile-logs.appspot.com/serve/' + queryData.report);
        }
      } else if (queryData.customProfile !== undefined) {
        window.loadProfileURL(queryData.customProfile);
      } else if (queryData.usesample !== undefined) {
        var filename;
        if (filename == "pseudo") {
          filename = 'sample.profile';
        } else if (queryData.usesample !== null) {
          filename = queryData.usesample;
        } else {
          filename = "sample.big";
        }
        window.loadProfileURL(filename);
      } else if (queryData.zippedProfile) {
        // Fetch a compressed eideticker profile
        window.loadZippedProfileURL(queryData.zippedProfile);
      }
      window.loadQueryData(queryData);
    }
  };

  window.Cleopatra = Cleopatra;
  Cleopatra.init();
}(this));
