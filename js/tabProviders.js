var gContentScaleID = 0;

function toFixed(num, fixed) {
    fixed = fixed || 0;
    fixed = Math.pow(10, fixed);
    return Math.floor(num * fixed) / fixed;
}

function tab_showInstruction(tabName, instruction) {
  var currentTab = gTabWidget.getTab(tabName);
  if (currentTab && currentTab.isInstruction !== true) {
    // We have a real tab, don't set instructions
    return;
  }

  var container = createElement("div", {
    className: "tab",
    style: {
      background: "white",
      height: "100%",
    },
    textContent: instruction,
  });
  container.isInstruction = true;
  gTabWidget.addTab(tabName, container); 
}


function tab_showDisplayListDump(displayListDumpLines, title, time) {
  time = time || 0;
  function parseDisplayListDump() {
    var section = null;
    displayListParts = {};
    for (var i = 0; i < displayListDumpLines.length; i++) {
      var line = displayListDumpLines[i].name || displayListDumpLines[i];
      if (line.indexOf("Painting --- before optimization (") == 0) {
        section = "before";
        continue;
      } else if (line == "Painting --- after optimization:") {
        section = "after";
        continue;
      } else if (line == "Painting --- layer tree:") {
        section = "tree";
        continue;
      }
      displayListParts[section] = displayListParts[section] || [];
      displayListParts[section].push(line);
    }

    return {
      before: parseDisplayList(displayListParts["before"]),
      after: parseDisplayList(displayListParts["after"]),
      tree: parseLayers(displayListParts["tree"]),
    };
  }
  var container = createElement("div", {
    style: {
      background: "white",
      height: "100%",
      position: "relative",
    },
  });

  var titleDiv = createElement("div", {
    className: "treeColumnHeader",
    style: {
      width: "100%",
    },
    textContent: title + " (near " + time.toFixed(0) + " ms)",
  });
  container.appendChild(titleDiv);

  var mainDiv = createElement("div", {
    style: {
      position: "absolute",
      top: "16px",
      left: "0px",
      right: "0px",
      bottom: "0px",
    },
  });
  container.appendChild(mainDiv);

  var layerListPane = createElement("div", {
    style: {
      cssFloat: "left",
      height: "100%",
      width: "300px",
      overflowY: "scroll",
    },
  });
  mainDiv.appendChild(layerListPane);

  var previewContainerDiv = createElement("div", {
    style: {
      position: "absolute",
      left: "300px",
      right: "0px",
      top: "0px",
      bottom: "0px",
      padding: "5px",
      overflow: "auto",
    },
  });
  mainDiv.appendChild(previewContainerDiv);

  var contentScaleValues = [1, 1.5, 2];

  var contentScaleInput = createElement("span", {
    textContent: "Content Scale:"
  });
  previewContainerDiv.appendChild(contentScaleInput);
  var contentScaleInput = createElement("input", {
    type: "range",
    min: 0,
    max: contentScaleValues.length - 1,
    value: gContentScaleID,
    onchange: function() {
      gContentScaleID = parseInt(contentScaleInput.value);
      renderPreview();
      contentScaleValue.textContent = contentScaleValues[gContentScaleID];
    },
  });
  previewContainerDiv.appendChild(contentScaleInput);
  var contentScaleValue = createElement("span", {
    textContent: contentScaleValues[gContentScaleID]
  });
  previewContainerDiv.appendChild(contentScaleValue);

  var previewDiv = createElement("div", {
    style: {
      position: "absolute",
      left: "0px",
      right: "0px",
      top: "50px",
      bottom: "0px",
      padding: "5px",
      overflow: "auto",
    },
  });
  previewContainerDiv.appendChild(previewDiv);

  var displayListDump = parseDisplayListDump();

  function renderPreview() {
    var contentScale = contentScaleValues[gContentScaleID];
    previewDiv.innerHTML = "";
    layerListPane.innerHTML = "";
    populateLayers(displayListDump['tree'], displayListDump['after'], layerListPane, previewDiv, null, contentScale);
  }
  renderPreview();

  gTabWidget.addTab("DisplayList", container); 
  gTabWidget.selectTab("DisplayList");
}
