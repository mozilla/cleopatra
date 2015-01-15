QUnit.test("Cleopatra load", function(assert) {
  loadCleopatra({
    assert: assert,
    testFunc: function(cleopatraObj) {
      // Look for the basic elements of the apge
      assert.ok("Cleopatra - UI for SPS" === cleopatraObj.document.title, "Check title");
      assert.ok(cleopatraObj.document.getElementById("datafile"), "Has upload field");
      assert.ok(cleopatraObj.document.getElementById("data"), "Has paste field");
      assert.ok(cleopatraObj.document.getElementById("parse"), "Has parse button");
    }
  });
});
