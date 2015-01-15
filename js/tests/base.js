QUnit.config.reorder = false;

function loadCleopatra(obj) {
  var qunitWaitForLoad = obj.assert.async();

  const TEST_CLEOPATRA_IFRAME_ID = "test_cleopatra";
  if (document.getElementById(TEST_CLEOPATRA_IFRAME_ID)) {
    var frameToRemove = document.getElementById(TEST_CLEOPATRA_IFRAME_ID);
    frameToRemove.parentNode.removeChild(frameToRemove);
  }

  var iframe = document.createElement("iframe");
  iframe.id = TEST_CLEOPATRA_IFRAME_ID;
  iframe.style.position = "absolute"
  iframe.style.width = "100%";
  iframe.style.height = "1024px";
  iframe.onload = function() {
    if (obj.testFunc) {
      obj.testFunc(iframe.contentDocument);
    }

    if (obj.profileLoadFunc) {
      var qunitWaitForProfileLoad = obj.assert.async();
      iframe.contentDocument.addEventListener('cleopatra_profile_load', function (e) {
        obj.profileLoadFunc(iframe.contentDocument);
        qunitWaitForProfileLoad();
      });
    }

    if (obj.updatedFiltersFunc) {
      var qunitWait = obj.assert.async();
      iframe.contentDocument.addEventListener('cleopatra_updated_filter', function (e) {
        obj.updatedFiltersFunc(iframe.contentDocument);
        qunitWait();
      });
    }

    qunitWaitForLoad();
  };
  iframe.src = "index.html" + (obj.query || "")
  document.body.appendChild(iframe);
}

function shownSamples(cleopatraDocument) {
  var shownSamples = cleopatraDocument.defaultView.gCurrentlyShownSampleData;
  var c = 0;
  for (var i = 0; i < shownSamples.length; i++) {
    if (shownSamples[i] != null) {
      c++;
    }
  }
  return c;
}