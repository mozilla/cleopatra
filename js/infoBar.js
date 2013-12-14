'use strict';

(function(window) {
  function InfoBar() {
    this._container = document.createElement("div");
    this._container.id = "infoBar";
    this._container.className = "sideBar";
  }

  InfoBar.prototype = {
    getContainer: function InfoBar_getContainer() {
      return this._container;
    },
    display: function InfoBar_display() {
      function getMetaFeatureString() {
        features = "<dt>Stackwalk:</dt><dd>" + (gMeta.stackwalk ? "True" : "False") + "</dd>";
        features += "<dt>Jank:</dt><dd>" + (gMeta.stackwalk ? "True" : "False") + "</dd>";
        return features;
      }
      function getPlatformInfo() {
        return gMeta.oscpu + " (" + gMeta.toolkit + ")";
      }
      var infobar = this._container;
      var infoText = "";

      if (gMeta) {
        infoText += "<h2>Profile Info</h2>\n<dl>\n";
        infoText += "<dt>Product:</dt><dd>" + gMeta.product + "</dd>";
        infoText += "<dt>Platform:</dt><dd>" + getPlatformInfo() + "</dd>";
        infoText += getMetaFeatureString();
        infoText += "<dt>Interval:</dt><dd>" + gMeta.interval + " ms</dd></dl>";
      }
      infoText += "<h2>Selection Info</h2>\n<dl>\n";
      infoText += "  <dt>Avg. Responsiveness:</dt><dd>" + avgResponsiveness().toFixed(2) + " ms</dd>\n";
      infoText += "  <dt>Max Responsiveness:</dt><dd>" + maxResponsiveness().toFixed(2) + " ms</dd>\n";
      infoText += "  <dt>Real Interval:</dt><dd>" + effectiveInterval() + "</dd>";
      infoText += "</dl>\n";
      infoText += "<h2>Pre Filtering</h2>\n";
      // Disable for now since it's buggy and not useful
      //infoText += "<label><input type='checkbox' id='mergeFunctions' " + (gMergeFunctions ?" checked='true' ":" ") + " onchange='toggleMergeFunctions()'/>Functions, not lines</label><br>\n";

      var filterNameInputOld = document.getElementById("filterName");
      infoText += "<a>Filter:\n";
      infoText += "<input type='search' id='filterName' oninput='filterOnChange()'/></a>\n";

      infoText += "<h2>Post Filtering</h2>\n";
      infoText += "<label><input type='checkbox' id='showJank' " + (gJankOnly ?" checked='true' ":" ") + " onchange='toggleJank()'/>Show Jank only</label>\n";
      infoText += "<h2>View Options</h2>\n";
      infoText += "<label><input type='checkbox' id='showJS' " + (gJavascriptOnly ?" checked='true' ":" ") + " onchange='toggleJavascriptOnly()'/>Javascript only</label><br>\n";
      infoText += "<label><input type='checkbox' id='mergeUnbranched' " + (gMergeUnbranched ?" checked='true' ":" ") + " onchange='toggleMergeUnbranched()'/>Merge unbranched call paths</label><br>\n";
      infoText += "<label><input type='checkbox' id='invertCallstack' " + (gInvertCallstack ?" checked='true' ":" ") + " onchange='toggleInvertCallStack()'/>Invert callstack</label><br>\n";

      infoText += "<h2>Share</h2>\n";
      infoText += "<div id='upload_status' aria-live='polite'>No upload in progress</div><br>\n";
      infoText += "<input type='button' id='upload' value='Upload full profile'>\n";
      infoText += "<input type='button' id='upload_select' value='Upload view'><br>\n";
      infoText += "<input type='button' id='download' value='Download full profile'>\n";

      infoText += "<h2>Compare</h2>\n";
      infoText += "<input type='button' id='compare' value='Compare'>\n";

      //infoText += "<br>\n";
      //infoText += "Skip functions:<br>\n";
      //infoText += "<select size=8 id='skipsymbol'></select><br />"
      //infoText += "<input type='button' id='delete_skipsymbol' value='Delete'/><br />\n";
      //infoText += "<input type='button' id='add_skipsymbol' value='Add'/><br />\n";
      
      infobar.innerHTML = infoText;
      addTooltips();

      var filterNameInputNew = document.getElementById("filterName");
      if (filterNameInputOld != null && filterNameInputNew != null) {
        filterNameInputNew.parentNode.replaceChild(filterNameInputOld, filterNameInputNew);
        //filterNameInputNew.value = filterNameInputOld.value;
      } else if (gQueryParamFilterName != null) {
        filterNameInputNew.value = gQueryParamFilterName;
        gQueryParamFilterName = null;
      }
      document.getElementById('compare').onclick = function() {
        openProfileCompare();
      }
      document.getElementById('upload').onclick = function() {
        promptUploadProfile(false);
      };
      document.getElementById('download').onclick = downloadProfile;
      document.getElementById('upload_select').onclick = function() {
        promptUploadProfile(true);
      };
      //document.getElementById('delete_skipsymbol').onclick = delete_skip_symbol;
      //document.getElementById('add_skipsymbol').onclick = add_skip_symbol;

      //populate_skip_symbol();
    }
  }

  window.InfoBar = InfoBar;
}(this));
