
function MarkerTreeManager() {
  this.treeView = new TreeView();
  this.treeView.setColumns([
    { name: "markerType", title: "Type" },
    { name: "markerCount", title: "Time" },
    { name: "resource", title: "" },
    { name: "markerName", title: "Marker Name"}
  ]);
  this.treeView._HTMLForFunction = this._HTMLForFunction;
  var self = this;
  this.treeView.addEventListener("select", function (frameData) {
    //self.highlightFrame(frameData);
    //if (window.comparator_setSelection) {
    //  window.comparator_setSelection(gTreeManager.serializeCurrentSelectionSnapshot(), frameData);
    //}
  });
  this.treeView.addEventListener("select", function (markerData) {
    function selectMarkerDiv(markerDiv) {
      if (self.lastSelected) {
        self.lastSelected.style.fontWeight = "normal";
        self.lastSelected.style.zIndex = "0";
        self.lastSelected.style.maxWidth = "50px";
      }
      markerDiv.style.fontWeight = "bold";
      markerDiv.style.zIndex = "1";
      markerDiv.style.maxWidth = "300px";
      self.lastSelected = markerDiv;
    }
    var markerDivs = document.getElementsByClassName("marker");
    for (var i = 0; i < markerDivs.length; i++) {
      var markerDiv = markerDivs.item(i);
      var markers = markerDiv.markers;
      for (var j = 0; j < markers.length; j++) {
        var marker = markers[j];
        if (marker.name == markerData.name && marker.time == markerData.time) {
          selectMarkerDiv(markerDiv);
          return;
        }
      }
    }
  });
  this._container = document.createElement("div");
  this._container.className = "tree";
  this._container.appendChild(this.treeView.getContainer());
}
MarkerTreeManager.prototype = {
  getContainer: function MarkerTreeManager_getContainer() {
    return this._container;
  },
  highlightFrame: function Treedisplay_highlightFrame(frameData) {
    /**
     * @todo Decouple AppUI
     */
    AppUI.setHighlightedCallstack(this._getCallstackUpTo(frameData), this._getHeaviestCallstack(frameData));
  },
  dataIsOutdated: function MarkerTreeManager_dataIsOutdated() {
    this.treeView.dataIsOutdated();
  },
  setSelection: function MarkerTreeManager_setSelection(frames) {
    return this.treeView.setSelection(frames);
  },
  display: function MarkerTreeManager_display(markers) {
    this.treeView.display(this.convertToJSTreeData(markers));
  },
  hide: function MarkerTreeManager_hide() {
    this._container.classList.add("hidden");
  },
  show: function MarkerTreeManager_show() {
    this._container.classList.remove("hidden");
  },
  getTreeHeader: function MarkerTreeManager_getTreeHeader() {
    return this.treeView.getTreeHeader();
  },
  selectMarker: function MarkerTreeManager_selectMarker(marker) {
    this.treeView.setSelection(["(markers)", marker.name]);
  },
  _HTMLForFunction: function MarkerTreeManager__HTMLForFunction(node, depth) {
     //TODO: fix xss
     return '' +
       '<span class="sampleCount rowLabel">Marker</span> ' +
       '<span class="samplePercentage rowLabel"></span> ' +
       '<span class="selfSampleCount rowLabel">' + Math.round(node.time) + '</span> ' +
       '<span class="resourceIcon rowLabel" data-resource="' + node.library + '"></span> ' +
       '<span title="Expand / Collapse" class="expandCollapseButton" style="margin-left:' + (depth+1) + 'em"></span>' +
       '<span class="functionName">' + node.name + '</span>' +
       '<span class="libraryName">' + node.library + '</span>' +
       '<span title="Focus Callstack" title="Focus Callstack" class="focusCallstackButton">';
  },
  buildTreeForStack: function MarkerTreeManager_buildTreeForStack(stack, pos) {
    var self = this;
    return [{getData: function() { return self._buildTreeForStackInternal(stack, pos); }}];
  },
  _buildTreeForStackInternal: function MarkerTreeManager_buildTreeForStackInternal(stack, pos) {
    pos = pos | 0;
    if (pos >= stack.length) {
      return null;
    }
    var self = this;
    var rootObj = {};
    rootObj.counter = 0;
    rootObj.time = "";
    rootObj.name = stack[pos];
    rootObj.library = "";
    if (pos+1 < stack.length) {
      rootObj.children = [{getData: function() { return self._buildTreeForStackInternal(stack, pos+1); }}];
    }
    return rootObj;
  },
  convertToJSTreeData: function MarkerTreeManager__convertToJSTreeData(markers) {
    var self = this;
    function createMarkerTreeViewNode(marker, parent) {
      var currObj = {};
      currObj.parent = parent;
      currObj.counter = 0;
      currObj.time = marker.time;
      currObj.name = marker.name;
      //if (marker.marker.data && marker.marker.data.interval) {
      //  currObj.name += marker.marker.data.interval;
      //}
      currObj.library = "Main Thread";
      currObj.marker = marker;
      if (marker.marker.data && marker.marker.data.type == "innerHTML") {
        currObj.children = [ {
          getData: function() {
            var child = {};
            child.parent = currObj;
            child.counter = 0;
            child.time = marker.time;
            child.name = marker.marker.data.innerHTML;
            child.library = "";
            child.marker = marker;
            return child;
          }
        }];
      } else if (marker.marker.data && marker.marker.data.stack) {
        currObj.children = self.buildTreeForStack(marker.marker.data.stack);
          /*
          [ {
          getData: function() {
            var child = {};
            child.parent = currObj;
            child.counter = 0;
            child.time = marker.time;
            child.name = "stack";
            child.library = "";
            child.marker = marker;
            return child;
          }
        }];
        */
      }
      return currObj;
    }
    function getMarkerChildrenObjects(markers, parent) {
      var markers = markers.slice(0);
      return markers.map(function (child) {
        var createdNode = null;
        return {
          getData: function () {
            if (!createdNode) {
              createdNode = createMarkerTreeViewNode(child, parent); 
            }
            return createdNode;
          }
        };
      });
    }
    var rootObj = {};
    rootObj.counter = 0;
    rootObj.time = "";
    rootObj.name = "(markers)";
    rootObj.library = "";
    rootObj.children = getMarkerChildrenObjects(markers, rootObj);
    return [{getData: function() { return rootObj; }}];
    var totalSamples = rootNode.counter;
    function createTreeViewNode(node, parent) {
      var curObj = {};
      curObj.parent = parent;
      curObj.counter = node.counter;
      var selfCounter = node.counter;
      for (var i = 0; i < node.children.length; ++i) {
        selfCounter -= node.children[i].counter;
      }
      curObj.selfCounter = selfCounter;
      curObj.ratio = node.counter / totalSamples;
      curObj.fullFrameNamesAsInSample = node.mergedNames ? node.mergedNames : [node.name];
      if (!(node.name in (useFunctions ? functions : symbols))) {
        curObj.name = node.name;
        curObj.library = "";
      } else {
        var functionObj = useFunctions ? functions[node.name] : functions[symbols[node.name].functionIndex];
        var info = {
          functionName: functionObj.functionName,
          libraryName: functionObj.libraryName,
          lineInformation: useFunctions ? "" : symbols[node.name].lineInformation
        };  
        curObj.name = (info.functionName + " " + info.lineInformation).trim();
        curObj.library = info.libraryName;
        curObj.isJSFrame = functionObj.isJSFrame;
        if (functionObj.scriptLocation) {
          curObj.scriptLocation = functionObj.scriptLocation;
        }
      }
      if (node.children.length) {
        curObj.children = getChildrenObjects(node.children, curObj);
      }
      return curObj;
    }
    function getChildrenObjects(children, parent) {
      var sortedChildren = children.slice(0).sort(treeObjSort);
      return sortedChildren.map(function (child) {
        var createdNode = null;
        return {
          getData: function () {
            if (!createdNode) {
              createdNode = createTreeViewNode(child, parent); 
            }
            return createdNode;
          }
        };
      });
    }
    return getChildrenObjects([rootNode], null);
  },
};


