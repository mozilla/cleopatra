function loadCleopatra(obj) {
  var qunitWaitForLoad = obj.assert.async();

  const TEST_CLEOPATRA_IFRAME_ID = "test_cleopatra";
  if (document.getElementById(TEST_CLEOPATRA_IFRAME_ID)) {
    var frameToRemove = document.getElementById(TEST_CLEOPATRA_IFRAME_ID);
    frameToRemove.parent.removeChild(TEST_CLEOPATRA_IFRAME_ID);
  }

  var iframe = document.createElement("iframe");
  iframe.id = TEST_CLEOPATRA_IFRAME_ID;
  iframe.style.position = "absolute"
  iframe.style.width = "100%";
  iframe.style.height = "1024px";
  iframe.onload = function() {
    obj.testFunc(iframe.contentDocument);
    qunitWaitForLoad();
  };
  iframe.src = "index.html"
  document.body.appendChild(iframe);
}
