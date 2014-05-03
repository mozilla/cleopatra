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

function tab_showLayersDump(layersDumpLines, compositeTitle, compositeTime) {
  function parseLayers() {
    for (var i = 0; i < layersDumpLines.length; i++) {
      // Something like 'ThebesLayerComposite (0x12104cc00) [shadow-visible=< (x=0, y=0, w=1920, h=158); >] [visible=< (x=0, y=0, w=1920, h=158); >] [opaqueContent] [valid=< (x=0, y=0, w=1920, h=2218); >]'
      var line = layersDumpLines[i].name;

      var layerObject = {
      }

      var matches = line.match("(\\w+)\\s\\((\\w+)\\)(.*)");
      layerObject.name = matches[1];
      layerObject.address = matches[2];

      var rest = matches[3];

      var fields = [];
      var nesting = 0;
      var startIndex;
      for (var j = 0; j < rest.length; j++) {
        if (rest.charAt(j) == '[') {
          nesting++;
          if (nesting == 1) {
            startIndex = j;
          }
        } else if (rest.charAt(j) == ']') {
          nesting--;
          if (nesting == 0) {
            fields.push(rest.substring(startIndex + 1, j));
          }
        }
      }

      for (var j = 0; j < fields.length; j++) {
        // Something like 'valid=< (x=0, y=0, w=1920, h=2218); >' or 'opaqueContent'
        var field = fields[j];
        var parts = field.split("=", 2);
        var fieldName = parts[0];
        if (parts.length == 1) {
          // bool value
          layerObject[fieldName] = true;
        } else {
          
        }
      }
      dump("Fields: " + JSON.stringify(fields) + "\n");
    }
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
    textContent: compositeTitle + " (near " + compositeTime.toFixed(0) + " ms)",
  });
  container.appendChild(titleDiv);
  parseLayers();

  gTabWidget.addTab("LayerTree", container); 
  gTabWidget.selectTab("LayerTree");
}
