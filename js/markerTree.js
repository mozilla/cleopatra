
function MarkerTreeManager() {
  this.treeView = new TreeView();
  this.treeView.setColumns([
    { name: "markerType", title: "Type" },
    { name: "markerCount", title: "Marker Count" },
    { name: "resource", title: "" },
    { name: "markerName", title: "Marker Name"}
  ]);
  var self = this;
  this.treeView.addEventListener("select", function (frameData) {
    //self.highlightFrame(frameData);
    //if (window.comparator_setSelection) {
    //  window.comparator_setSelection(gTreeManager.serializeCurrentSelectionSnapshot(), frameData);
    //}
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
    setHighlightedCallstack(this._getCallstackUpTo(frameData), this._getHeaviestCallstack(frameData));
  },
  dataIsOutdated: function MarkerTreeManager_dataIsOutdated() {
    this.treeView.dataIsOutdated();
  },
  setSelection: function MarkerTreeManager_setSelection(frames) {
    return this.treeView.setSelection(frames);
  },
  display: function MarkerTreeManager_display(tree, symbols, functions, resources, useFunctions, filterByName) {
    this.treeView.display(this.convertToJSTreeData(tree, symbols, functions, useFunctions), resources, filterByName);
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
  convertToJSTreeData: function MarkerTreeManager__convertToJSTreeData(rootNode, symbols, functions, useFunctions) {
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


