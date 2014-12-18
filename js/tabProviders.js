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

function parseDisplayList(lines) {
  var root = {
    line: "DisplayListRoot 0",
    name: "DisplayListRoot",
    address: "0x0",
    children: [],
  };

  var objectAtIndentation = {
    "-1": root,
  };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    var layerObject = {
      line: line,
      children: [],
    }
    if (!root) {
      root = layerObject;
    }

    var matches = line.match("(\\s*)(\\w+)\\sp=(\\w+)(.*?)?( layer=(\\w+))?$");
    if (!matches) {
      dump("Failed to match: " + line + "\n");
      continue;
    }

    var indentation = Math.floor(matches[1].length / 2);
    objectAtIndentation[indentation] = layerObject;
    var parent = objectAtIndentation[indentation - 1];
    parent.children.push(layerObject);

    layerObject.name = matches[2];
    layerObject.address = matches[3]; // Use 0x prefix to be consistent with layer dump
    var rest = matches[4];
    if (matches[6]) { // WrapList don't provide a layer
      layerObject.layer = matches[6];
    }

    // the content node name doesn't have a prefix, this makes the parsing easier
    rest = "content" + rest;

    var fields = {};
    var nesting = 0;
    var startIndex;
    var lastSpace = -1;
    var lastFieldStart = -1;
    for (var j = 0; j < rest.length; j++) {
      if (rest.charAt(j) == '(') {
        nesting++;
        if (nesting == 1) {
          startIndex = j;
        }
      } else if (rest.charAt(j) == ')') {
        nesting--;
        if (nesting == 0) {
          var name = rest.substring(lastSpace + 1, startIndex);
          var value = rest.substring(startIndex + 1, j);

          var rectMatches = value.match("^(.*?),(.*?),(.*?),(.*?)$")
          if (rectMatches) {
            layerObject[name] = [
              parseFloat(rectMatches[1]) / 60,
              parseFloat(rectMatches[2]) / 60,
              parseFloat(rectMatches[3]) / 60,
              parseFloat(rectMatches[4]) / 60,
            ];
          } else {
            layerObject[name] = value;
          }
        }
      } else if (nesting == 0 && rest.charAt(j) == ' ') {
        lastSpace = j;
      }
    }
    //dump("FIELDS: " + JSON.stringify(fields) + "\n");
  }
  return root;
}

function trim(s){ 
  return ( s || '' ).replace( /^\s+|\s+$/g, '' ); 
}

function getDataURI(str) {
  if (str.indexOf("data:image/png;base64,") == 0) {
    return str;
  }

  var matches = str.match("data:image/lz4bgra;base64,([0-9]+),([0-9]+),([0-9]+),(.*)");
  if (!matches)
    return null;

  var canvas = document.createElement("canvas");
  var w = parseInt(matches[1]);
  var stride = parseInt(matches[2]);
  var h = parseInt(matches[3]);
  canvas.width = w;
  canvas.height = h;

  // TODO handle stride

  var binary_string = window.atob(matches[4]);
  var len = binary_string.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    var ascii = binary_string.charCodeAt(i);
    bytes[i] = ascii;
  }

  var ctxt = canvas.getContext("2d");
  var out = ctxt.createImageData(w, h);
  buffer = LZ4_uncompressChunk(bytes, out.data);

  for (var x = 0; x < w; x++) {
    for (var y = 0; y < h; y++) {
      var blue = out.data[4 * x + 4 * y * w + 0];
      out.data[4 * x + 4 * y * w + 0] = out.data[4 * x + 4 * y * w + 2];
      out.data[4 * x + 4 * y * w + 2] = blue;
    }
  }

  ctxt.putImageData(out, 0, 0);
  return canvas.toDataURL();
}

function parseLayers(layersDumpLines) {
  function parseMatrix2x3(str) {
    str = trim(str);

    // Something like '[ 1 0; 0 1; 0 158; ]'
    var matches = str.match("\\[ (.*?) (.*?); (.*?) (.*?); (.*?) (.*?); \\]");
    if (!matches) {
      return null;
    }

    var matrix = [
      [parseFloat(matches[1]), parseFloat(matches[2])],
      [parseFloat(matches[3]), parseFloat(matches[4])],
      [parseFloat(matches[5]), parseFloat(matches[6])],
    ];

    return matrix;
  }
  function parseColor(str) {
    str = trim(str);

    // Something like 'rgba(0, 0, 0, 0)'
    var colorMatches = str.match("rgba\\((.*), (.*), (.*), (.*)\\)");
    if (!colorMatches) {
      return null;
    }

    var color = {
      r: colorMatches[1],
      g: colorMatches[2],
      b: colorMatches[3],
      a: colorMatches[4],
    };
    return color;
  }
  function parseRect2D(str) {
    str = trim(str);

    // Something like '(x=0, y=0, w=2842, h=158)'
    var rectMatches = str.match("\\(x=(.*?), y=(.*?), w=(.*?), h=(.*?)\\)");
    if (!rectMatches) {
      return null;
    }

    var rect = [
      parseFloat(rectMatches[1]), parseFloat(rectMatches[2]),
      parseFloat(rectMatches[3]), parseFloat(rectMatches[4]),
    ];
    return rect;
  }
  function parseRegion(str) {
    str = trim(str);

    // Something like '< (x=0, y=0, w=2842, h=158); (x=0, y=1718, w=2842, h=500); >'
    if (str.charAt(0) != '<' || str.charAt(str.length - 1) != '>') {
      return null;
    }

    var region = [];
    str = trim(str.substring(1, str.length - 1));
    while (str != "") {
      var rectMatches = str.match("\\(x=(.*?), y=(.*?), w=(.*?), h=(.*?)\\);");
      if (!rectMatches) {
        return null;
      }

      var rect = [
        parseFloat(rectMatches[1]), parseFloat(rectMatches[2]),
        parseFloat(rectMatches[3]), parseFloat(rectMatches[4]),
      ];
      str = trim(str.substring(rectMatches[0].length, str.length));
      region.push(rect);
    }
    return region;
  }

  var root;
  var objectAtIndentation = {};
  for (var i = 0; i < layersDumpLines.length; i++) {
    // Something like 'ThebesLayerComposite (0x12104cc00) [shadow-visible=< (x=0, y=0, w=1920, h=158); >] [visible=< (x=0, y=0, w=1920, h=158); >] [opaqueContent] [valid=< (x=0, y=0, w=1920, h=2218); >]'
    var line = layersDumpLines[i].name || layersDumpLines[i];

    var tileMatches = line.match("(\\s*)Tile \\(x=(.*), y=(.*)\\): (.*)");
    if (tileMatches) {
      var indentation = Math.floor(matches[1].length / 2);
      var x = tileMatches[2];
      var y = tileMatches[3];
      var dataUri = tileMatches[4];
      var parent = objectAtIndentation[indentation - 1];
      var tiles = parent.tiles || {};

      tiles[x] = tiles[x] || {};
      tiles[x][y] = dataUri;

      parent.tiles = tiles;

      continue;
    }

    var surfaceMatches = line.match("(\\s*)Surface: (.*)");
    if (surfaceMatches) {
      var indentation = Math.floor(matches[1].length / 2);
      var parent = objectAtIndentation[indentation - 2];
      var surfaceURI = surfaceMatches[2];
      parent.surfaceURI = surfaceURI;
      console.log("Add surface: " + parent.line);

      continue;
    }

    var layerObject = {
      line: line,
      children: [],
    }
    if (!root) {
      root = layerObject;
    }

    var matches = line.match("(\\s*)(\\w+)\\s\\((\\w+)\\)(.*)");
    if (!matches)
      continue; // Something like a texturehost dump. Safe to ignore

    if (matches[2].indexOf("TiledContentHost") != -1 ||
        matches[2].indexOf("GrallocTextureHostOGL") != -1 ||
        matches[2].indexOf("ContentHost") != -1 ||
        matches[2].indexOf("MemoryTextureHost") != -1 ||
        matches[2].indexOf("ImageHost") != -1)
      continue; // We're already pretty good at visualizing these

    var indentation = Math.floor(matches[1].length / 2);
    objectAtIndentation[indentation] = layerObject;
    if (indentation > 0) {
      var parent = objectAtIndentation[indentation - 1];
      while (!parent) {
        indentation--;
        parent = objectAtIndentation[indentation - 1];
      }

      parent.children.push(layerObject);
    }

    layerObject.name = matches[2];
    layerObject.address = matches[3];

    var rest = matches[4];

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
      //dump("FIELD: " + field + "\n");
      var parts = field.split("=", 2);
      var fieldName = parts[0];
      var rest = field.substring(fieldName.length + 1);
      if (parts.length == 1) {
        layerObject[fieldName] = "true";
        layerObject[fieldName].type = "bool";
        continue;
      }
      var region = parseRegion(rest); 
      if (region) {
        layerObject[fieldName] = region;
        layerObject[fieldName].type = "region";
        continue;
      }
      var rect = parseRect2D(rest);
      if (rect) {
        layerObject[fieldName] = rect;
        layerObject[fieldName].type = "rect2d";
        continue;
      }
      var matrix = parseMatrix2x3(rest);
      if (matrix) {
        layerObject[fieldName] = matrix;
        layerObject[fieldName].type = "matrix2x3";
        continue;
      }
      var color = parseColor(rest);
      if (color) {
        layerObject[fieldName] = color;
        layerObject[fieldName].type = "color";
        continue;
      }
    }

    // Compute screenTransformX/screenTransformY
    // TODO Fully support transforms
    if (layerObject['shadow-transform'] && layerObject['transform']) {
      layerObject['screen-transform'] = [layerObject['shadow-transform'][2][0], layerObject['shadow-transform'][2][1]];
      var currIndentation = indentation - 1;
      while (currIndentation >= 0) {
        var transform = objectAtIndentation[currIndentation]['shadow-transform'] || objectAtIndentation[currIndentation]['transform'];
        if (transform) {
          layerObject['screen-transform'][0] += transform[2][0];
          layerObject['screen-transform'][1] += transform[2][1];
        }
        currIndentation--;
      }
    }

    //dump("Fields: " + JSON.stringify(fields) + "\n");
  }
  root.compositeTime = layersDumpLines.compositeTime;
  //dump("OBJECTS: " + JSON.stringify(root) + "\n");
  return root;
}
function populateLayers(root, displayList, pane, previewParent, hasSeenRoot) {
  function getDisplayItemForLayer(displayList) {
    var items = [];
    if (!displayList) {
      return items;
    }
    if (displayList.layer == root.address) {
      items.push(displayList);
    }
    for (var i = 0; i < displayList.children.length; i++) {
      var subDisplayItems = getDisplayItemForLayer(displayList.children[i]);
      for (var j = 0; j < subDisplayItems.length; j++) {
        items.push(subDisplayItems[j]);
      }
    }
    return items;
  }
  var elem = createElement("div", {
    className: "layerObjectDescription",
    textContent: root.line,
    style: {
      whiteSpace: "pre",
    },
    onmouseover: function() {
      if (this.layerViewport) {
        this.layerViewport.classList.add("layerHover");
      }
    },
    onmouseout: function() {
      if (this.layerViewport) {
        this.layerViewport.classList.remove("layerHover");
      }
    },
  });
  pane.appendChild(elem);

  if (root["shadow-visible"] || root["visible"]) {
    var visibleRegion = root["shadow-visible"] || root["visible"];
    var layerViewport = createElement("div", {
      id: root.address + "_viewport",
      style: {
        position: "absolute",
      },
    });
    elem.layerViewport = layerViewport;
    var layerViewportMatrix = [1, 0, 0, 1, 0, 0];
    if (root["shadow-clip"] || root["clip"]) {
      var clip = root["shadow-clip"] || root["clip"]
      var clipElem = createElement("div", {
        id: root.address + "_clip",
        style: {
          left: clip[0]+"px",
          top: clip[1]+"px",
          width: clip[2]+"px",
          height: clip[3]+"px",
          position: "absolute",
          overflow: "hidden",
        },
      });
      layerViewportMatrix[4] += -clip[0];
      layerViewportMatrix[5] += -clip[1];
      layerViewport.style.transform = "translate(-" + clip[0] + "px, -" + clip[1] + "px" + ")";
    }
    if (root["shadow-transform"] || root["transform"]) {
      var matrix = root["shadow-transform"] || root["transform"];
      layerViewportMatrix[0] = matrix[0][0];
      layerViewportMatrix[1] = matrix[0][1];
      layerViewportMatrix[2] = matrix[1][0];
      layerViewportMatrix[3] = matrix[1][1];
      layerViewportMatrix[4] += matrix[2][0];
      layerViewportMatrix[5] += matrix[2][1];
    }
    console.log("matrix(" + layerViewportMatrix[0] + "px," + layerViewportMatrix[1] + "px," + layerViewportMatrix[2] + "px," + layerViewportMatrix[3] + "px," + layerViewportMatrix[4] + "px," + layerViewportMatrix[5] + "px)");
    layerViewport.style.transform = "matrix(" + layerViewportMatrix[0] + "," + layerViewportMatrix[1] + "," + layerViewportMatrix[2] + "," + layerViewportMatrix[3] + "," + layerViewportMatrix[4] + "," + layerViewportMatrix[5] + ")";
    if (!hasSeenRoot) {
      hasSeenRoot = true;
      //layerViewport.style.transform = "scale(0.25, 0.25)";
    }
    if (clipElem) {
      previewParent.appendChild(clipElem);
      clipElem.appendChild(layerViewport);
    } else {
      previewParent.appendChild(layerViewport);
    }
    previewParent = layerViewport;
    for (var i = 0; i < visibleRegion.length; i++) {
      var rect2d = visibleRegion[i];
      var layerPreview = createElement("div", {
        id: root.address + "_visible_part" + i,
        className: "layerPreview",
        style: {
          position: "absolute",
          left: rect2d[0] + "px",
          top: rect2d[1] + "px",
          width: rect2d[2] + "px",
          height: rect2d[3] + "px",
          overflow: "hidden",
          border: "solid 1px black",
          background: 'url("images/noise.png"), linear-gradient(rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.2))',
        },
      });
      layerViewport.appendChild(layerPreview);

      function isInside(rect1, rect2) {
        if (rect1[0] + rect1[2] < rect2[0] && rect2[0] + rect2[2] < rect1[0] &&
            rect1[1] + rect1[3] < rect2[1] && rect2[1] + rect2[3] < rect1[1]) {
          return true;
        }
        return true;
      }

      var hasImg = false;
      // Add tile img objects for this part
      if (root.tiles) {
        hasImg = true;
        for (var x in root.tiles) {
          for (var y in root.tiles[x]) {
            if (isInside(rect2d, [x, y, 512, 512])) {
              var tileImgElem = createElement("img", {
                src: getDataURI(root.tiles[x][y]),
                style: {
                  position: "absolute",
                  left: (x - rect2d[0]) + "px",
                  top: (y - rect2d[1]) + "px",
                },
              });
              layerPreview.appendChild(tileImgElem);
            }
          }
        }
      } else if (root.surfaceURI) {
        hasImg = true;
        var offsetX = 0;
        var offsetY = 0;
        if (root.bounds) {
          offsetX = root.bounds[0];
          offsetY = root.bounds[1];
        }
        var surfaceImgElem = createElement("img", {
          src: getDataURI(root.surfaceURI),
          style: {
            position: "absolute",
            left: (offsetX - rect2d[0]) + "px",
            top: (offsetY - rect2d[1]) + "px",
          },
        });
        layerPreview.appendChild(surfaceImgElem);
      } else if (root.color) {
        hasImg = true;
        layerPreview.style.background = "rgba(" + root.color.r + ", " + root.color.g + ", " + root.color.b + ", " + root.color.a + ")";
      }
      
      if (hasImg || true) {
        layerPreview.mouseoverElem = elem;
        layerPreview.onmouseenter = function() {
          this.mouseoverElem.onmouseover();
        }
        layerPreview.onmouseout = function() {
          this.mouseoverElem.onmouseout();
        }
      }
    }

    var layerDisplayItems = getDisplayItemForLayer(displayList);
    for (var i = 0; i < layerDisplayItems.length; i++) {
      var displayItem = layerDisplayItems[i];
      var displayElem = createElement("div", {
        className: "layerObjectDescription",
        textContent: "            " + trim(displayItem.line),
        style: {
          whiteSpace: "pre",
        },
        layerViewport: layerViewport,
        onmouseover: function() {
          if (this.layerPreview) {
            this.layerPreview.classList.add("displayHover");
          }
        },
        onmouseout: function() {
          if (this.layerPreview) {
            this.layerPreview.classList.remove("displayHover");
          }
        },
      });
      pane.appendChild(displayElem);
      // bounds doesn't adjust for within the layer. It's not a bad fallback but
      // will have the wrong offset
      var rect2d = displayItem.layerBounds || displayItem.bounds;
      if (rect2d) { // This doesn't place them corectly
        layerPreview = createElement("div", {
          id: "displayitem_" + displayItem.content + "_" + displayItem.address,
          className: "layerPreview",
          style: {
            position: "absolute",
            left: rect2d[0] + "px",
            top: rect2d[1] + "px",
            width: rect2d[2] + "px",
            height: rect2d[3] + "px",
            border: "solid 1px gray",
          },
        });
        layerViewport.appendChild(layerPreview);
        displayElem.layerPreview = layerPreview;
      }
    }
  }

  for (var i = 0; i < root.children.length; i++) {
    populateLayers(root.children[i], displayList, pane, previewParent, hasSeenRoot);
  }
}
function tab_showLayersDump(layersDumpLines, compositeTitle, compositeTime) {
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
    textContent: compositeTitle + (compositeTitle ? " (near " + compositeTime.toFixed(0) + " ms)" : ""),
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

  var previewDiv = createElement("div", {
    style: {
      position: "absolute",
      left: "300px",
      right: "0px",
      top: "0px",
      bottom: "0px",
      overflow: "auto",
    },
  });
  mainDiv.appendChild(previewDiv);

  var root = parseLayers(layersDumpLines);
  populateLayers(root, null, layerListPane, previewDiv);

  gTabWidget.addTab("LayerTree", container); 
  gTabWidget.selectTab("LayerTree");
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

  var previewDiv = createElement("div", {
    style: {
      position: "absolute",
      left: "300px",
      right: "0px",
      top: "0px",
      bottom: "0px",
      overflow: "auto",
    },
  });
  mainDiv.appendChild(previewDiv);

  var displayListDump = parseDisplayListDump();
  populateLayers(displayListDump['tree'], displayListDump['before'], layerListPane, previewDiv);

  gTabWidget.addTab("DisplayList", container); 
  gTabWidget.selectTab("DisplayList");
}
